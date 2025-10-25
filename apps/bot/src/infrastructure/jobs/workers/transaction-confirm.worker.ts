import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  TransactionConfirmJobData,
  JOB_POSITION_MONITOR,
  JOB_NOTIFICATION,
} from "../job-definitions";
import type { NotificationMessagePayload } from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions, users, User } from "@/db";
import { eq } from "drizzle-orm";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import { PositionCreationContext } from "@/application/position/create-position.use-case";
import { positionPersistenceService } from "@/services/position-persistence.service";
import { rebalancePersistenceService } from "@/services/rebalance-persistence.service";
import { closePositionPersistenceService } from "@/services/close-position-persistence.service";
import { getTokenPriceService } from "@/services/token-price.service";
import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { getCacheService } from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";
import {
  parseMeteoraInstructions,
  MeteoraDlmmInstruction,
} from "@/utils/tx-parser";
import { ClaimFeesContext, PositionClosureContext } from "@/application";
import Decimal from "decimal.js";
import { lamportsToUi } from "@/utils/math";
import { Token } from "@/types/token.types";
import {
  formatPercentage,
  formatPrice,
} from "@/presentation/formatters/base.formatter";
import { claimFeesPersistenceService } from "@/services/claim-fees-persistence.service";
import { SOL_MINT } from "@/config/constants";

type CloseInstructionExtractionResult = {
  positionAddress?: string;
  finalTokenAAmount?: string;
  finalTokenBAmount?: string;
  claimedFeesTokenA?: string;
  claimedFeesTokenB?: string;
  removeInstructionCount: number;
  claimInstructionCount: number;
  closeInstructionCount: number;
};

export class TransactionConfirmWorker
  implements IWorker<TransactionConfirmJobData>
{
  private readonly priceService = getTokenPriceService();
  private readonly meteoraAdapter = new MeteoraAdapter();
  private readonly cache = getCacheService();

  constructor(
    private readonly solana: SolanaAdapter,
    private readonly positionRepository: PositionRepository
  ) {}

  async process(job: Job<TransactionConfirmJobData>) {
    console.log("TransactionConfirmWorker", job.data);
    const {
      signature,
      operationType,
      userId,
      positionId,
      positionAddress,
      submittedAt,
    } = job.data;
    const started = Date.now();

    try {
      const status = await this.solana.getSignatureStatus(signature);
      if (!status || (!status.confirmationStatus && !status.err)) {
        // Pending/no info: decide on retry vs timeout
        const [ptx] = await db
          .select()
          .from(pendingTransactions)
          .where(eq(pendingTransactions.signature, signature));
        const created =
          ptx?.createdAt ||
          (submittedAt ? new Date(submittedAt) : new Date(Date.now() - 1000));
        const ageMs = Date.now() - new Date(created).getTime();
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        if (ageMs > timeoutMs) {
          await db
            .update(pendingTransactions)
            .set({
              status: "FAILED",
              updatedAt: new Date(),
              errorMessage: "Timeout while waiting for confirmation",
            })
            .where(eq(pendingTransactions.signature, signature));
          logger.warn(
            { signature },
            "[TxConfirmWorker] Marked as FAILED due to timeout"
          );
          return { confirmed: false, timeout: true };
        }
        // Re-throw to trigger retry/backoff
        throw new Error("Pending confirmation");
      }

      if (status?.err) {
        await db
          .update(pendingTransactions)
          .set({
            status: "FAILED",
            updatedAt: new Date(),
            errorMessage: JSON.stringify(status.err),
          })
          .where(eq(pendingTransactions.signature, signature));
        logger.warn({ signature }, "[TxConfirmWorker] Transaction failed");
        return { confirmed: false, failed: true };
      }

      // Consider confirmed once confirmationStatus present and not "processed"
      await db
        .update(pendingTransactions)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(pendingTransactions.signature, signature));

      // Domain side-effects based on operation type
      try {
        if (operationType === "CREATE_POSITION") {
          await this.handleCreatePosition(signature, userId, positionAddress);
        } else if (operationType === "REBALANCE") {
          await this.handleRebalance(
            signature,
            userId,
            positionId,
            positionAddress
          );
        } else if (operationType === "CLOSE_POSITION") {
          await this.handleClosePosition(
            signature,
            userId,
            positionId,
            positionAddress
          );
        } else if (operationType === "CLAIM_FEES") {
          await this.handleClaimFees(
            signature,
            userId,
            positionId,
            positionAddress
          );
        }
      } catch (err) {
        logger.warn(
          { err },
          "[TxConfirmWorker] Post-confirm side-effects failed"
        );
      }

      const duration = Date.now() - started;
      logger.info(
        { signature, operationType, duration },
        "[TxConfirmWorker] Confirmed"
      );
      return { confirmed: true, status };
    } catch (error) {
      logger.debug({ error, signature }, "[TxConfirmWorker] Pending or error");
      throw error; // rely on backoff/attempts
    }
  }

  /**
   * Handle CREATE_POSITION confirmation
   * Parse transaction data and create DB records
   */
  private async handleCreatePosition(
    signature: string,
    userId: string,
    positionAddress?: string
  ): Promise<void> {
    try {
      const ptx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, signature),
      });

      if (!ptx || !ptx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata found",
          { signature }
        );
        return;
      }

      const metadata =
        typeof ptx.metadata === "string"
          ? JSON.parse(ptx.metadata)
          : ptx.metadata;
      const context: PositionCreationContext | undefined =
        metadata.positionContext;

      if (!context) {
        logger.error("[TxConfirmWorker] No position context in metadata", {
          signature,
        });
        return;
      }

      logger.info(
        "[TxConfirmWorker] Parsing transaction data from blockchain",
        {
          signature,
          poolAddress: context.poolAddress,
        }
      );

      const connection = this.solana.getConnection();
      const parsedTransaction = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
        }
      );

      if (!parsedTransaction) {
        logger.error("[TxConfirmWorker] Transaction not found on-chain", {
          signature,
        });
        return;
      }

      const instructions = parseMeteoraInstructions(parsedTransaction);

      if (!instructions || instructions.length === 0) {
        logger.error(
          "[TxConfirmWorker] No Meteora instructions found in transaction",
          {
            signature,
          }
        );
        return;
      }

      logger.info("[TxConfirmWorker] Parsed Meteora instructions", {
        signature,
        instructionCount: instructions.length,
        instructions: instructions.map((i) => ({
          name: i.instructionName,
          type: i.instructionType,
        })),
      });

      const initializeInstruction = instructions.find(
        (ix) => ix.instructionType === "open"
      );

      const addLiquidityInstruction = instructions.find(
        (ix) => ix.instructionType === "add"
      );

      if (!initializeInstruction || !addLiquidityInstruction) {
        logger.error(
          "[TxConfirmWorker] Missing required instructions (open or add)",
          {
            signature,
            hasOpen: !!initializeInstruction,
            hasAdd: !!addLiquidityInstruction,
          }
        );
        return;
      }

      const effectivePositionAddress =
        positionAddress ??
        initializeInstruction.accounts.position ??
        context.positionAddress;

      if (!effectivePositionAddress) {
        logger.error("[TxConfirmWorker] Position address not available", {
          signature,
        });
        return;
      }

      let actualTokenAAmount = context.tokenAAmount;
      let actualTokenBAmount = context.tokenBAmount;

      console.log("addLiquidityInstruction", addLiquidityInstruction);

      if (addLiquidityInstruction.tokenTransfers.length > 0) {
        const tokenAMint = context.tokenA.address;
        const tokenBMint = context.tokenB.address;

        const tokenATransfer = addLiquidityInstruction.tokenTransfers.find(
          (t) => t.mint === tokenAMint
        );
        const tokenBTransfer = addLiquidityInstruction.tokenTransfers.find(
          (t) => t.mint === tokenBMint
        );

        if (tokenATransfer) {
          actualTokenAAmount = lamportsToUi(
            tokenATransfer.amount,
            context.tokenA.decimals
          );
        }
        if (tokenBTransfer) {
          actualTokenBAmount = lamportsToUi(
            tokenBTransfer.amount,
            context.tokenB.decimals
          );
        }

        logger.info(
          "[TxConfirmWorker] Extracted token amounts from transfers",
          {
            signature,
            actualTokenAAmount,
            actualTokenBAmount,
            tokenTransfers: addLiquidityInstruction.tokenTransfers,
          }
        );
      }

      const onChainData = {
        actualTokenAAmount,
        actualTokenBAmount,
        lowerBinId: undefined,
        upperBinId: undefined,
      };

      const tokenMints = [context.tokenA.address, context.tokenB.address];
      const solMint = SOL_MINT;
      if (!tokenMints.includes(solMint)) {
        tokenMints.push(solMint);
      }

      const priceData = await this.priceService.getPrices(tokenMints);
      const prices = {
        tokenAUsd: priceData[context.tokenA.address]?.price ?? 0,
        tokenBUsd: priceData[context.tokenB.address]?.price ?? 0,
        solUsd: priceData[solMint]?.price ?? 0,
      };

      logger.info("[TxConfirmWorker] Fetched token prices", { prices });

      const createdPositionId = await positionPersistenceService.createPosition(
        {
          signature,
          positionAddress: effectivePositionAddress,
          context,
          onChainData,
          prices,
        }
      );

      logger.info("[TxConfirmWorker] Position created in database", {
        positionId: createdPositionId,
        positionAddress: effectivePositionAddress,
        signature,
      });

      await this.cache.invalidate(CachePatterns.portfolioPattern(userId));

      const jobQueue = new JobQueueService({ producerOnly: true });

      if (context.autoRebalance) {
        await jobQueue.enqueue(
          JOB_POSITION_MONITOR,
          {
            userId,
            positionId: createdPositionId,
          },
          {
            repeat: {
              every: 60 * 60 * 1000,
            },
          }
        );
        logger.info("[TxConfirmWorker] Position monitoring job scheduled", {
          positionId: createdPositionId,
        });
      }

      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId,
        notification: {
          type: "general",
          title: "Position Created",
          message: `Your position has been successfully created! View it in your portfolio.`,
        },
      });

      logger.info("[TxConfirmWorker] CREATE_POSITION handled successfully", {
        positionId: createdPositionId,
        signature,
      });
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle CREATE_POSITION", {
        error,
        signature,
        userId,
        positionAddress,
      });
      throw error;
    }
  }

  private async handleClaimFees(
    signature: string,
    userId: string,
    positionId?: string,
    positionAddress?: string
  ): Promise<void> {
    try {
      const ptx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, signature),
      });

      if (!ptx || !ptx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata for claim fees",
          { signature }
        );
        return;
      }

      const metadata =
        typeof ptx.metadata === "string"
          ? JSON.parse(ptx.metadata)
          : ptx.metadata;

      const claimContext = metadata?.claimContext as
        | ClaimFeesContext
        | undefined;

      if (!claimContext) {
        logger.error("[TxConfirmWorker] Missing claim context", {
          signature,
        });
        return;
      }

      const solMint = SOL_MINT;

      let effectivePositionId: string | undefined =
        positionId ?? claimContext.positionId ?? undefined;
      const effectiveUserId = claimContext.userId ?? userId;
      const effectivePositionAddress =
        positionAddress ?? claimContext.positionAddress ?? undefined;

      if (!effectivePositionId && claimContext.positionAddress) {
        try {
          const found = await this.positionRepository.findByPositionAddress(
            claimContext.positionAddress
          );
          effectivePositionId = found?.id;
        } catch (error) {
          logger.warn(
            "[TxConfirmWorker] Failed to resolve position ID from address",
            {
              signature,
              error,
              positionAddress: claimContext.positionAddress,
            }
          );
        }
      }

      if (!effectivePositionId || !effectivePositionAddress) {
        logger.error(
          "[TxConfirmWorker] Insufficient context to process claim fees",
          {
            signature,
            effectivePositionId,
            effectivePositionAddress,
          }
        );
        return;
      }

      const userRecord = effectiveUserId
        ? await db.query.users.findFirst({
            where: eq(users.id, effectiveUserId),
          })
        : null;

      const connection = this.solana.getConnection();
      const parsedTransaction = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
        }
      );

      if (!parsedTransaction) {
        logger.error("[TxConfirmWorker] Claim transaction not found", {
          signature,
        });
        return;
      }

      const meteoraInstructions = parseMeteoraInstructions(parsedTransaction);

      if (meteoraInstructions.length === 0) {
        logger.warn("[TxConfirmWorker] No claim instructions detected", {
          signature,
        });
        return;
      }

      const {
        positionAddress: onChainPositionAddress,
        claimedFeesTokenA,
        claimedFeesTokenB,
      } = this.extractClaimFeesInstructionData(
        meteoraInstructions,
        claimContext.tokenA,
        claimContext.tokenB
      );

      console.log("claimedFeesTokenA", claimedFeesTokenA);
      console.log("claimedFeesTokenB", claimedFeesTokenB);

      if (onChainPositionAddress) {
        positionAddress = onChainPositionAddress;
      }

      const claimedFeesTokenADecimal = new Decimal(claimedFeesTokenA);
      const claimedFeesTokenBDecimal = new Decimal(claimedFeesTokenB);

      const priceMints = Array.from(
        new Set(
          [
            claimContext.tokenA.address,
            claimContext.tokenB.address,
            solMint,
          ].filter((mint) => mint && mint.length)
        )
      );

      const priceData = await this.priceService.getPrices(priceMints);
      const tokenAPriceUsd = priceData[claimContext.tokenA.address]?.price ?? 0;
      const tokenBPriceUsd = priceData[claimContext.tokenB.address]?.price ?? 0;
      const solPriceUsd = priceData[solMint]?.price ?? 0;

      console.log("tokenAPriceUsd", tokenAPriceUsd);
      console.log("tokenBPriceUsd", tokenBPriceUsd);
      console.log("solPriceUsd", solPriceUsd);

      const claimedUsdValue = claimedFeesTokenADecimal
        .mul(tokenAPriceUsd)
        .add(claimedFeesTokenBDecimal.mul(tokenBPriceUsd));
      console.log("claimedUsdValue", claimedUsdValue);

      let solReceivedDecimal = new Decimal(0);

      const shouldConvertToSol = claimContext.convertToSol !== false;
      if (shouldConvertToSol && !userRecord) {
        logger.warn("[TxConfirmWorker] Unable to load user for claim swap", {
          signature,
          userId: effectiveUserId,
        });
      }

      // if (shouldConvertToSol && userRecord) {
      //   if (rawAmountABig > 0n && tokenAMint && tokenAMint !== solMint) {
      //     const solFromA = await this.swapTokenToSol(
      //       userRecord,
      //       tokenAMint,
      //       rawAmountABig
      //     );
      //     solReceivedDecimal = solReceivedDecimal.add(solFromA);
      //   }

      //   if (rawAmountBBig > 0n && tokenBMint && tokenBMint !== solMint) {
      //     const solFromB = await this.swapTokenToSol(
      //       userRecord,
      //       tokenBMint,
      //       rawAmountBBig
      //     );
      //     solReceivedDecimal = solReceivedDecimal.add(solFromB);
      //   }
      // }

      // let claimedUsdDecimal = estimatedUsdDecimal;
      // if (solReceivedDecimal.gt(0) && solPriceUsd > 0) {
      //   claimedUsdDecimal = solReceivedDecimal.mul(solPriceUsd);
      // }
      // const claimedUsdValue = claimedUsdDecimal.toFixed(2);

      const solReceivedStr = solReceivedDecimal.gt(0)
        ? solReceivedDecimal.toDecimalPlaces(9, Decimal.ROUND_DOWN).toString()
        : undefined;
      console.log("solReceivedStr", solReceivedStr);

      let snapshotData:
        | {
            tokenXAmount: string;
            tokenYAmount: string;
            currentValueUsd: string;
            unclaimedFeesX?: string;
            unclaimedFeesY?: string;
            unclaimedFeesUsd?: string;
          }
        | undefined;

      if (claimContext.poolAddress && claimContext.userAddress) {
        try {
          const onchainPosition = await this.meteoraAdapter.getPosition(
            effectivePositionAddress,
            {
              userAddress: claimContext.userAddress,
              poolAddress: claimContext.poolAddress,
            }
          );

          // console.log("onchainPosition", onchainPosition);

          if (onchainPosition) {
            snapshotData = {
              tokenXAmount: onchainPosition.tokenAAmount ?? "0",
              tokenYAmount: onchainPosition.tokenBAmount ?? "0",
              currentValueUsd: new Decimal(
                onchainPosition.currentValueUsd ?? 0
              ).toFixed(6),
              unclaimedFeesUsd: new Decimal(
                onchainPosition.unclaimedFeesUsd ?? 0
              ).toFixed(2),
              unclaimedFeesX: "0",
              unclaimedFeesY: "0",
            };
          }
        } catch (error) {
          logger.warn(
            "[TxConfirmWorker] Failed to fetch on-chain position for snapshot",
            {
              error,
              signature,
              positionAddress: effectivePositionAddress,
            }
          );
        }
      }

      await claimFeesPersistenceService.recordClaim({
        signature,
        context: {
          positionId: effectivePositionId,
          userId: effectiveUserId,
        },
        claimed: {
          tokenXAmount: claimedFeesTokenADecimal.toFixed(6),
          tokenYAmount: claimedFeesTokenBDecimal.toFixed(6),
          claimedUsdValue: claimedUsdValue.toFixed(6),
          solReceived: solReceivedStr,
        },
        prices: {
          tokenXPriceUsd: tokenAPriceUsd,
          tokenYPriceUsd: tokenBPriceUsd,
          solUsd: solPriceUsd,
        },
        claimType: "manual",
        snapshot: snapshotData,
      });

      await this.cache.invalidate(
        CachePatterns.portfolioPattern(effectiveUserId)
      );
      await this.cache.invalidate(
        CachePatterns.positionPattern(effectivePositionId)
      );

      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        const usdLabel = claimedUsdValue.isZero()
          ? "$0.00"
          : `$${claimedUsdValue.toFixed(2)}`;
        const solLabel = solReceivedStr
          ? `${solReceivedDecimal
              .toDecimalPlaces(6, Decimal.ROUND_DOWN)
              .toString()} SOL`
          : "0 SOL";

        await jobQueue.enqueue(JOB_NOTIFICATION, {
          userId: effectiveUserId,
          notification: {
            type: "general",
            title: "Fees Claimed",
            message: `Claim confirmed: ~${usdLabel} converted to ${solLabel}.`,
          },
        });
      } catch (error) {
        logger.error("[TxConfirmWorker] Failed to enqueue claim notification", {
          error,
          signature,
        });
      }

      logger.info("[TxConfirmWorker] CLAIM_FEES handled successfully", {
        signature,
        positionId: effectivePositionId,
        claimedUsdValue,
        solReceived: solReceivedStr,
      });
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle CLAIM_FEES", {
        error,
        signature,
        userId,
        positionId,
        positionAddress,
      });
      throw error;
    }
  }

  // private async swapTokenToSol(
  //   user: User,
  //   tokenMint: string,
  //   rawAmount: bigint
  // ): Promise<Decimal> {
  //   if (!tokenMint || rawAmount <= 0n) {
  //     return new Decimal(0);
  //   }

  //   if (tokenMint === SOL_MINT) {
  //     return this.lamportsToSol(rawAmount);
  //   }

  //   if (!user.walletAddress || !user.walletId) {
  //     logger.warn(
  //       "[TxConfirmWorker] User missing wallet information for swap",
  //       {
  //         userId: user.id,
  //       }
  //     );
  //     return new Decimal(0);
  //   }

  //   try {
  //     const amountStr = rawAmount.toString();
  //     const order = await jupiterService.getOrder({
  //       inputMint: tokenMint,
  //       outputMint: SOL_MINT,
  //       amount: amountStr,
  //       taker: user.walletAddress,
  //     });

  //     if (!order?.transaction) {
  //       logger.warn("[TxConfirmWorker] Jupiter order missing transaction", {
  //         tokenMint,
  //         userId: user.id,
  //       });
  //       return new Decimal(0);
  //     }

  //     const swapTx = jupiterService.getOrderTransaction(order.transaction);
  //     const { signedTransaction } = await WalletService.signTransaction(
  //       user,
  //       swapTx
  //     );

  //     const executeResult = await jupiterService.executeOrder({
  //       requestId: order.requestId,
  //       signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
  //         "base64"
  //       ),
  //     });

  //     if (executeResult.status !== "Success") {
  //       logger.warn("[TxConfirmWorker] Jupiter swap execution failed", {
  //         tokenMint,
  //         userId: user.id,
  //         error: executeResult.error,
  //       });
  //       return new Decimal(0);
  //     }

  //     const outputLamports = new Decimal(
  //       executeResult.outputAmountResult ?? "0"
  //     );

  //     return outputLamports.div(1_000_000_000);
  //   } catch (error) {
  //     logger.warn("[TxConfirmWorker] Jupiter swap failed", {
  //       error,
  //       tokenMint,
  //       userId: user.id,
  //     });
  //     return new Decimal(0);
  //   }
  // }

  /**
   * Handle REBALANCE confirmation
   */
  private async handleRebalance(
    signature: string,
    userId: string,
    positionId?: string,
    positionAddress?: string
  ): Promise<void> {
    try {
      const [ptx] = await db
        .select()
        .from(pendingTransactions)
        .where(eq(pendingTransactions.signature, signature))
        .limit(1);

      if (!ptx || !ptx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata for rebalance",
          {
            signature,
          }
        );
        return;
      }

      const metadata =
        typeof ptx.metadata === "string"
          ? JSON.parse(ptx.metadata)
          : ptx.metadata;
      const rebalanceContext = metadata.rebalanceContext as
        | {
            positionId: string;
            userId: string;
            userAddress: string;
            poolAddress: string;
            dex: string;
            oldPositionAddress: string;
            tokenAMint: string;
            tokenBMint: string;
            tokenASymbol?: string;
            tokenBSymbol?: string;
            tokenADecimals?: number;
            tokenBDecimals?: number;
            triggerReason?: string;
          }
        | undefined;

      if (!rebalanceContext) {
        logger.error("[TxConfirmWorker] Missing rebalance context", {
          signature,
        });
        return;
      }

      const effectivePositionId = positionId ?? rebalanceContext.positionId;
      const effectiveOldAddress = rebalanceContext.oldPositionAddress;
      const adapterMetadata = metadata.adapterMetadata ?? {};

      const newPositionAddress =
        (adapterMetadata.create?.positionPublicKey as string | undefined) ||
        (adapterMetadata.newPositionAddress as string | undefined) ||
        positionAddress;

      if (!newPositionAddress) {
        logger.error(
          "[TxConfirmWorker] Unable to determine new position address after rebalance",
          {
            signature,
            rebalanceContext,
          }
        );
        return;
      }

      logger.info("[TxConfirmWorker] Processing rebalance confirmation", {
        signature,
        positionId: effectivePositionId,
        oldPositionAddress: effectiveOldAddress,
        newPositionAddress,
      });

      // Fetch on-chain data for new position
      let actualTokenAAmount = "0";
      let actualTokenBAmount = "0";
      try {
        const position = await this.meteoraAdapter.getPosition(
          newPositionAddress,
          {
            userAddress: rebalanceContext.userAddress,
            poolAddress: rebalanceContext.poolAddress,
          }
        );
        if (position) {
          actualTokenAAmount = position.tokenAAmount;
          actualTokenBAmount = position.tokenBAmount;
        }
      } catch (err) {
        logger.warn(
          "[TxConfirmWorker] Failed to fetch new position data after rebalance",
          {
            err,
            newPositionAddress,
          }
        );
      }

      // Fetch token prices
      const solMint = SOL_MINT;
      const priceData = await this.priceService.getPrices([
        rebalanceContext.tokenAMint,
        rebalanceContext.tokenBMint,
        solMint,
      ]);

      const prices = {
        tokenAUsd: priceData[rebalanceContext.tokenAMint]?.price ?? 0,
        tokenBUsd: priceData[rebalanceContext.tokenBMint]?.price ?? 0,
        solUsd: priceData[solMint]?.price ?? 0,
      };

      await rebalancePersistenceService.rebalancePosition({
        signature,
        context: {
          userId: rebalanceContext.userId,
          positionId: effectivePositionId,
          oldPositionAddress: effectiveOldAddress,
          newPositionAddress,
          triggerReason: rebalanceContext.triggerReason ?? "rebalance",
          tokenAAmount: actualTokenAAmount,
          tokenBAmount: actualTokenBAmount,
          tokenAMint: rebalanceContext.tokenAMint,
          tokenBMint: rebalanceContext.tokenBMint,
          poolAddress: rebalanceContext.poolAddress,
        },
        prices,
      });

      logger.info("[TxConfirmWorker] Rebalance persisted", {
        signature,
        positionId: effectivePositionId,
        newPositionAddress,
      });

      await this.cache.invalidate(CachePatterns.portfolioPattern(userId));
      await this.cache.invalidate(
        CachePatterns.positionPattern(effectivePositionId)
      );

      const jobQueue = new JobQueueService({ producerOnly: true });
      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId,
        notification: {
          type: "rebalance",
          title: "Position Rebalanced",
          message: `Rebalance completed successfully for position ${effectivePositionId}.`,
        },
      });
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle REBALANCE", {
        error,
        signature,
        userId,
        positionId,
        positionAddress,
      });
      throw error;
    }
  }

  /**
   * Handle CLOSE_POSITION confirmation
   */
  private async handleClosePosition(
    signature: string,
    userId: string,
    positionId?: string,
    positionAddress?: string
  ): Promise<void> {
    try {
      const ptx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, signature),
      });

      if (!ptx || !ptx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata for close",
          {
            signature,
          }
        );
        return;
      }

      const metadata = ptx.metadata as any;

      const closeContext = metadata.closeContext as
        | PositionClosureContext
        | undefined;

      if (!closeContext) {
        logger.error("[TxConfirmWorker] Missing close context", {
          signature,
        });
        return;
      }

      const effectivePositionId = positionId ?? closeContext.positionId;
      let effectivePositionAddress =
        closeContext.positionAddress ?? positionAddress;
      const targetUserId = closeContext.userId ?? userId;

      if (!effectivePositionId) {
        logger.error("[TxConfirmWorker] Insufficient data to handle close", {
          signature,
          closeContext,
        });
        return;
      }

      let instructionData: CloseInstructionExtractionResult | undefined;
      try {
        const connection = this.solana.getConnection();
        const parsedTransaction = await connection.getParsedTransaction(
          signature,
          {
            maxSupportedTransactionVersion: 0,
          }
        );

        if (!parsedTransaction) {
          logger.error(
            "[TxConfirmWorker] Transaction not found on-chain for close",
            { signature }
          );
        } else {
          const instructions = parseMeteoraInstructions(parsedTransaction);

          if (!instructions || instructions.length === 0) {
            logger.error(
              "[TxConfirmWorker] No Meteora instructions found in close transaction",
              { signature }
            );
          } else {
            instructionData = this.extractCloseInstructionData(
              instructions,
              closeContext.tokenA,
              closeContext.tokenB
            );

            console.log("close instructionData", instructionData);

            if (instructionData.positionAddress) {
              effectivePositionAddress = instructionData.positionAddress;
            }

            logger.info("[TxConfirmWorker] Parsed Meteora close instructions", {
              signature,
              instructionCounts: {
                remove: instructionData.removeInstructionCount,
                claim: instructionData.claimInstructionCount,
                close: instructionData.closeInstructionCount,
              },
              finalTokenAAmount: instructionData.finalTokenAAmount,
              finalTokenBAmount: instructionData.finalTokenBAmount,
              claimedFeesTokenA: instructionData.claimedFeesTokenA,
              claimedFeesTokenB: instructionData.claimedFeesTokenB,
            });
          }
        }
      } catch (parseError) {
        logger.warn(
          { signature, error: parseError },
          "[TxConfirmWorker] Failed to parse close position transaction"
        );
      }

      if (!effectivePositionAddress) {
        logger.error(
          "[TxConfirmWorker] Unable to determine position address for close",
          {
            signature,
            closeContext,
          }
        );
        return;
      }

      const solMint = SOL_MINT;
      const priceData = await this.priceService.getPrices([
        closeContext.tokenA.address,
        closeContext.tokenB.address,
        solMint,
      ]);

      const prices = {
        tokenAUsd: priceData[closeContext.tokenA.address]?.price ?? 0,
        tokenBUsd: priceData[closeContext.tokenB.address]?.price ?? 0,
        solUsd: priceData[solMint]?.price ?? 0,
      };

      const onChainData =
        instructionData &&
        (instructionData.finalTokenAAmount !== undefined ||
          instructionData.finalTokenBAmount !== undefined ||
          instructionData.claimedFeesTokenA !== undefined ||
          instructionData.claimedFeesTokenB !== undefined)
          ? {
              finalTokenAAmount: instructionData.finalTokenAAmount,
              finalTokenBAmount: instructionData.finalTokenBAmount,
              claimedFeesX: instructionData.claimedFeesTokenA,
              claimedFeesY: instructionData.claimedFeesTokenB,
            }
          : undefined;

      const persistenceResult =
        await closePositionPersistenceService.closePosition({
          signature,
          context: {
            userId: targetUserId,
            positionId: effectivePositionId,
            positionAddress: effectivePositionAddress,
            poolAddress: closeContext.poolAddress,
            closureReason: closeContext.closureReason ?? "user_close",
            tokenAMint: closeContext.tokenA.address,
            tokenBMint: closeContext.tokenB.address,
          },
          onChainData,
          prices,
        });

      console.log("persistenceResult", persistenceResult);

      await this.cache.invalidate(CachePatterns.portfolioPattern(targetUserId));
      await this.cache.invalidate(
        CachePatterns.positionPattern(effectivePositionId)
      );

      const jobQueue = new JobQueueService({ producerOnly: true });
      const notificationMessages = this.buildClosePositionNotifications(
        signature,
        persistenceResult
      );
      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId: targetUserId,
        notification: {
          type: "position",
          messages: notificationMessages,
        },
      });

      logger.info("[TxConfirmWorker] CLOSE_POSITION handled successfully", {
        signature,
        positionId: effectivePositionId,
        positionAddress: effectivePositionAddress,
      });
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle CLOSE_POSITION", {
        error,
        signature,
        userId,
        positionId,
        positionAddress,
      });
      throw error;
    }
  }

  private buildClosePositionNotifications(
    signature: string,
    result: any
  ): NotificationMessagePayload[] {
    const pnlUsd = Number(result.totalPnlUSD);
    const pnlPercentage = Number(result.totalPnlPercentage);

    const formattedPnLUsd = formatPrice(pnlUsd, { maxDecimals: 2 });
    const formattedPnlPercentage = formatPercentage(pnlPercentage);
    const solscanUrl = `https://solscan.io/tx/${signature}`;

    const primaryMessage = [
      "✅ Position Closed",
      "",
      `PnL: ${formattedPnLUsd} (${formattedPnlPercentage})`,
      `Transaction: [View on Solscan](${solscanUrl})`,
    ].join("\n");

    return [
      {
        text: primaryMessage,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
      {
        text: "🖼️ Position summary image will be available soon.",
        disableLinkPreview: true,
      },
    ];
  }

  private extractCloseInstructionData(
    instructions: MeteoraDlmmInstruction[],
    tokenA: Token,
    tokenB: Token
  ): CloseInstructionExtractionResult {
    const removeTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };
    const claimTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };

    let removeInstructionCount = 0;
    let claimInstructionCount = 0;
    let closeInstructionCount = 0;
    let positionAddr: string | undefined;

    for (const instruction of instructions) {
      if (!positionAddr && instruction.accounts?.position) {
        positionAddr = instruction.accounts.position;
      }

      if (instruction.instructionType === "remove") {
        removeInstructionCount += 1;
      } else if (instruction.instructionType === "claim") {
        claimInstructionCount += 1;
      } else if (instruction.instructionType === "close") {
        closeInstructionCount += 1;
      }

      if (
        instruction.instructionType !== "remove" &&
        instruction.instructionType !== "claim"
      ) {
        continue;
      }

      if (!instruction.tokenTransfers?.length) {
        continue;
      }

      for (const transfer of instruction.tokenTransfers) {
        if (transfer.mint === tokenA.address) {
          const amount = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenA = removeTotals.tokenA.add(amount);
          } else {
            claimTotals.tokenA = claimTotals.tokenA.add(amount);
          }
        } else if (transfer.mint === tokenB.address) {
          const amount = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenB = removeTotals.tokenB.add(amount);
          } else {
            claimTotals.tokenB = claimTotals.tokenB.add(amount);
          }
        }
      }
    }

    return {
      positionAddress: positionAddr,
      finalTokenAAmount:
        removeInstructionCount > 0
          ? lamportsToUi(removeTotals.tokenA.toString(), tokenA.decimals)
          : undefined,
      finalTokenBAmount:
        removeInstructionCount > 0
          ? lamportsToUi(removeTotals.tokenB.toString(), tokenB.decimals)
          : undefined,
      claimedFeesTokenA:
        claimInstructionCount > 0
          ? lamportsToUi(claimTotals.tokenA.toString(), tokenA.decimals)
          : undefined,
      claimedFeesTokenB:
        claimInstructionCount > 0
          ? lamportsToUi(claimTotals.tokenB.toString(), tokenB.decimals)
          : undefined,
      removeInstructionCount,
      claimInstructionCount,
      closeInstructionCount,
    };
  }

  private extractClaimFeesInstructionData(
    instructions: MeteoraDlmmInstruction[],
    tokenA: Token,
    tokenB: Token
  ) {
    const claimTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };

    let positionAddr: string | undefined;

    for (const instruction of instructions) {
      if (!positionAddr && instruction.accounts?.position) {
        positionAddr = instruction.accounts.position;
      }

      if (
        instruction.instructionType === "claim" ||
        instruction.tokenTransfers?.length
      ) {
        for (const transfer of instruction.tokenTransfers) {
          if (transfer.mint === tokenA.address) {
            const amount = new Decimal(transfer.amount);
            claimTotals.tokenA = claimTotals.tokenA.add(amount);
          } else if (transfer.mint === tokenB.address) {
            const amount = new Decimal(transfer.amount);
            claimTotals.tokenB = claimTotals.tokenB.add(amount);
          }
        }
      }
    }

    return {
      positionAddress: positionAddr,
      claimedFeesTokenA: lamportsToUi(claimTotals.tokenA.toString(), 9),
      claimedFeesTokenB: lamportsToUi(claimTotals.tokenB.toString(), 9),
    };
  }
}
