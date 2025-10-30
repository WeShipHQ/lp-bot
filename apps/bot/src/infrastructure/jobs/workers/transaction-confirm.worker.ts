import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  TransactionConfirmJobData,
  JOB_POSITION_MONITOR,
  JOB_NOTIFICATION,
  JOB_TX_CONFIRM,
} from "../job-definitions";
import type { NotificationMessagePayload } from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions, users, User, PendingTransaction } from "@/db";
import { and, eq } from "drizzle-orm";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import { positionPersistenceService } from "@/services/position-persistence.service";
import { rebalancePersistenceService } from "@/services/rebalance-persistence.service";
import { closePositionPersistenceService } from "@/services/close-position-persistence.service";
import { getTokenPriceService } from "@/services/token-price.service";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { getCacheService } from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";
import {
  parseMeteoraInstructions,
  MeteoraDlmmInstruction,
} from "@/utils/tx-parser";
import { ClaimFeesContext, PositionClosureContext } from "@/application";
import {
  formatNumber,
  formatPercentage,
  formatPrice,
} from "@/presentation/formatters/base.formatter";
import { claimFeesPersistenceService } from "@/services/claim-fees-persistence.service";
import { MINIMAL_SOL_AMOUNT_IN_LAMPORTS, SOL_MINT } from "@/config/constants";
import { SwapService } from "@/services/swap.service";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import {
  CreatePositionUseCase,
  PositionCreationContext,
  SolSwapMetadata,
} from "@/application/position/create-position.use-case";
import {
  lamportsToSol,
  rawToUiAmount,
  solToLamports,
  uiToRawAmount,
} from "@/utils/number-utils";
import { dexRegistry } from "@/services/dex-registry.service";
import { CreatePositionParams, Token } from "@/types/core.types";
import { WalletService } from "@/services/wallet.service";
import { getPositionDeeplink, link } from "@/utils/misc";
import { getSolscanLink } from "@/utils/link";
import Decimal from "decimal.js";
import { CONFIG } from "@/config";

type ExtractedClosePositionIxsData = {
  positionAddress?: string;
  finalTokenAAmount: string;
  finalTokenBAmount: string;
  finalTokenAAmountLamports: string;
  finalTokenBAmountLamports: string;
  claimedFeesTokenA: string;
  claimedFeesTokenB: string;
  claimedFeesTokenALamports: string;
  claimedFeesTokenBLamports: string;
};

export class TransactionConfirmWorker
  implements IWorker<TransactionConfirmJobData>
{
  private readonly priceService = getTokenPriceService();
  private readonly cache = getCacheService();
  private readonly swapService = new SwapService();

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
      // Handle SOL→Token swap confirmations
      if (operationType === "SOL_TO_TOKEN_SWAP") {
        return await this.handleSwapConfirmation(signature, userId);
      }

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
            errorMessage: JSON.stringify(status.err),
          })
          .where(eq(pendingTransactions.signature, signature));
        logger.warn({ signature }, "[TxConfirmWorker] Transaction failed");
        return { confirmed: false, failed: true };
      }

      // Consider confirmed once confirmationStatus present and not "processed"
      await db
        .update(pendingTransactions)
        .set({ status: "COMPLETED" })
        .where(eq(pendingTransactions.signature, signature));

      // Domain side-effects based on operation type
      try {
        if (operationType === "CREATE_POSITION") {
          await this.handleCreatePosition(signature, userId, positionAddress);
        } else if (operationType === "REBALANCE") {
          await this.handleRebalance(signature, userId);
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
      const rebalanceSession: RebalanceSessionMetadata | undefined =
        metadata.rebalanceSession;

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
          actualTokenAAmount = rawToUiAmount(
            tokenATransfer.amount,
            context.tokenA.decimals
          ).toString();
        }
        if (tokenBTransfer) {
          actualTokenBAmount = rawToUiAmount(
            tokenBTransfer.amount,
            context.tokenB.decimals
          ).toString();
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

      const tokenMints = new Set([
        context.tokenA.address,
        context.tokenB.address,
        SOL_MINT,
      ]);

      const priceData = await this.priceService.getPrices(
        Array.from(tokenMints)
      );
      const prices = {
        tokenAUsd: priceData[context.tokenA.address]?.price ?? 0,
        tokenBUsd: priceData[context.tokenB.address]?.price ?? 0,
        solUsd: priceData[SOL_MINT]?.price ?? 0,
      };

      logger.info("[TxConfirmWorker] Fetched token prices", { prices });

      if (rebalanceSession) {
        await this.finalizeRebalanceCreation({
          signature,
          session: rebalanceSession,
          metadata,
          positionContext: context,
          effectivePositionAddress,
          actualTokenAAmount,
          actualTokenBAmount,
          prices,
          userId,
        });
        return;
      }

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
              // every: 60 * 60 * 1000,
              every: 60 * 30 * 1000,
            },
          }
        );
        logger.info("[TxConfirmWorker] Position monitoring job scheduled", {
          positionId: createdPositionId,
        });
      }

      const successMessage = [
        "✅ Position Created Successfully!",
        "",
        `${link("View Position", getPositionDeeplink(process.env.BOT_NAME!, context.dex, effectivePositionAddress))} \t|\t ${link("View Transaction", getSolscanLink("tx", signature))}`,
        "",
        "Your position is now active and earning fees!",
      ].join("\n");

      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId,
        notification: {
          type: "general",
          title: "Position Created",
          messages: [
            {
              text: successMessage,
              parseMode: "Markdown",
              disableLinkPreview: true,
            },
          ],
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

      if (onChainPositionAddress) {
        positionAddress = onChainPositionAddress;
      }

      const priceMints = Array.from(
        new Set(
          [
            claimContext.tokenA.address,
            claimContext.tokenB.address,
            SOL_MINT,
          ].filter((mint) => mint && mint.length)
        )
      );

      const priceData = await this.priceService.getPrices(priceMints);
      const tokenAPriceUsd = priceData[claimContext.tokenA.address]?.price ?? 0;
      const tokenBPriceUsd = priceData[claimContext.tokenB.address]?.price ?? 0;
      const solPriceUsd = priceData[SOL_MINT]?.price ?? 0;

      const claimedUsdValue = new Decimal(claimedFeesTokenA)
        .mul(tokenAPriceUsd)
        .add(new Decimal(claimedFeesTokenB).mul(tokenBPriceUsd));

      let solReceivedDecimal = new Decimal(0);

      const shouldConvertToSol = true; //claimContext.convertToSol !== false;
      if (shouldConvertToSol && !userRecord) {
        logger.warn("[TxConfirmWorker] Unable to load user for claim swap", {
          signature,
          userId: effectiveUserId,
        });
      }

      if (shouldConvertToSol && userRecord) {
        solReceivedDecimal = await this.swapClaimedTokensToSOL(
          userRecord,
          claimedFeesTokenA,
          claimContext.tokenA,
          claimedFeesTokenB,
          claimContext.tokenB
        );
      }

      // Recalculate USD value based on actual SOL received from swaps
      let finalClaimedUsdValue = claimedUsdValue;
      if (solReceivedDecimal.gt(0) && solPriceUsd > 0) {
        finalClaimedUsdValue = solReceivedDecimal.mul(solPriceUsd);
      }

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

      if (claimContext.poolAddress) {
        try {
          const dexRegistryInstance = container.get<typeof dexRegistry>(
            DI_TOKENS.DexRegistry
          );
          const adapter = dexRegistryInstance.get(
            claimContext.dex || "meteora"
          );

          const onchainPosition = await adapter.getPosition(
            effectivePositionAddress,
            claimContext.poolAddress
          );

          if (onchainPosition) {
            snapshotData = {
              tokenXAmount: onchainPosition.tokenAAmount ?? "0",
              tokenYAmount: onchainPosition.tokenBAmount ?? "0",
              currentValueUsd: new Decimal(0).toFixed(6),
              unclaimedFeesUsd: new Decimal(0).toFixed(2),
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
          tokenXAmount: claimedFeesTokenA,
          tokenYAmount: claimedFeesTokenB,
          claimedUsdValue: finalClaimedUsdValue.toString(),
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
        const usdLabel = finalClaimedUsdValue.isZero()
          ? "$0.00"
          : `${formatPrice(finalClaimedUsdValue.toNumber(), { maxDecimals: 2 })}`;
        const solLabel = solReceivedStr
          ? `${formatNumber(solReceivedDecimal.toNumber(), { maxDecimals: 9 })} SOL`
          : "0 SOL";

        await jobQueue.enqueue(JOB_NOTIFICATION, {
          userId: effectiveUserId,
          notification: {
            type: "general",
            title: "✅ *Fees claimed!*",
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

  /**
   * Handle REBALANCE confirmation
   */
  private async handleRebalance(
    signature: string,
    userId: string
  ): Promise<void> {
    try {
      const pendingTx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, signature),
      });

      if (!pendingTx || !pendingTx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata for rebalance",
          { signature }
        );
        return;
      }

      const metadata =
        typeof pendingTx.metadata === "string"
          ? JSON.parse(pendingTx.metadata)
          : pendingTx.metadata;

      const session = metadata?.rebalanceSession as
        | RebalanceSessionMetadata
        | undefined;

      if (!session) {
        logger.error("[TxConfirmWorker] Missing rebalance session metadata", {
          signature,
        });
        return;
      }

      if ((session.stage ?? "close") !== "close") {
        logger.info(
          "[TxConfirmWorker] Rebalance session not in close stage, skipping",
          { signature, stage: session.stage }
        );
        return;
      }

      await this.handleRebalanceClose({
        signature,
        pendingTxId: pendingTx.id,
        metadata,
        session,
        userId,
      });
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle REBALANCE", {
        error,
        signature,
        userId,
      });
      throw error;
    }
  }

  private async handleRebalanceClose(params: {
    signature: string;
    pendingTxId: string;
    metadata: any;
    //metadata ->  {
    //           positionId: string,
    //           userId: command.userIdstring,
    //           dex: DexType,
    //           poolAddress: string,
    //           oldPositionAddress: string,
    //         }
    session: RebalanceSessionMetadata;
    userId: string;
  }): Promise<void> {
    const { signature, pendingTxId, metadata, session } = params;

    const connection = this.solana.getConnection();
    const parsedTransaction = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!parsedTransaction) {
      logger.error(
        "[TxConfirmWorker] Rebalance close transaction not found on-chain",
        { signature }
      );
      throw new Error("Rebalance close transaction not found");
    }

    const instructions = parseMeteoraInstructions(parsedTransaction);
    if (!instructions || instructions.length === 0) {
      logger.error(
        "[TxConfirmWorker] No Meteora instructions found in rebalance close transaction",
        { signature }
      );
      throw new Error(
        "Missing Meteora instructions in rebalance close transaction"
      );
    }

    const closeExtraction = this.extractCloseInstructionData(
      instructions,
      session.tokenA,
      session.tokenB
    );

    const withdrawnTokenALamports = new Decimal(
      closeExtraction.finalTokenAAmountLamports ?? "0"
    );
    const withdrawnTokenBLamports = new Decimal(
      closeExtraction.finalTokenBAmountLamports ?? "0"
    );
    const claimedTokenALamports = new Decimal(
      closeExtraction.claimedFeesTokenALamports ?? "0"
    );
    const claimedTokenBLamports = new Decimal(
      closeExtraction.claimedFeesTokenBLamports ?? "0"
    );

    const totalTokenALamports = withdrawnTokenALamports.add(
      claimedTokenALamports
    );
    const totalTokenBLamports = withdrawnTokenBLamports.add(
      claimedTokenBLamports
    );

    const userRecord = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });
    if (!userRecord) {
      logger.error("[TxConfirmWorker] Unable to load user for rebalance", {
        userId: session.userId,
      });
      throw new Error("User not found for rebalance");
    }

    let totalTokensInSol = new Decimal(0);
    if (userRecord && closeExtraction) {
      const totalTokenAAmount = new Decimal(
        closeExtraction.finalTokenAAmount
      ).add(closeExtraction.claimedFeesTokenA);
      const totalTokenBAmount = new Decimal(
        closeExtraction.finalTokenBAmount
      ).add(closeExtraction.claimedFeesTokenB);

      totalTokensInSol = await this.swapClaimedTokensToSOL(
        userRecord,
        totalTokenAAmount.toString(),
        session.tokenA,
        totalTokenBAmount.toString(),
        session.tokenB
      );
    }
    const totalTokensInSolLamports = new Decimal(
      solToLamports(totalTokensInSol)
    );

    const closeSummary = {
      withdrawnTokenA: withdrawnTokenALamports.toString(),
      withdrawnTokenB: withdrawnTokenBLamports.toString(),
      claimedFeesTokenA: claimedTokenALamports.toString(),
      claimedFeesTokenB: claimedTokenBLamports.toString(),
      totalTokenA: totalTokenALamports.toString(),
      totalTokenB: totalTokenBLamports.toString(),
    };

    if (totalTokensInSolLamports.lte(0)) {
      throw new Error(
        "No SOL recovered from rebalance close; cannot recreate position"
      );
    }

    const reserveLamports = Decimal.min(
      totalTokensInSolLamports,
      new Decimal(MINIMAL_SOL_AMOUNT_IN_LAMPORTS)
    ).toDecimalPlaces(0, Decimal.ROUND_DOWN);

    const usableLamportsRaw = totalTokensInSolLamports.sub(reserveLamports);
    if (usableLamportsRaw.lte(0)) {
      throw new Error(
        "Insufficient SOL available after reserve to recreate position"
      );
    }

    const usableLamports = usableLamportsRaw.toDecimalPlaces(
      0,
      Decimal.ROUND_DOWN
    );

    const halfLamports = usableLamports.dividedToIntegerBy(2);
    const otherHalfLamports = usableLamports.sub(halfLamports);

    const conversions = {
      solBudgetLamports: usableLamports.toString(),
      reserveLamports: reserveLamports.toString(),
      solForTokenALamports: halfLamports.toString(),
      solForTokenBLamports: otherHalfLamports.toString(),
      solToTokenSignatures: {
        tokenA: undefined as string | undefined,
        tokenB: undefined as string | undefined,
      },
    };

    let purchasedTokenALamports: Decimal;
    if (session.tokenA.address === SOL_MINT) {
      purchasedTokenALamports = halfLamports;
    } else {
      const { result, tokenAmountLamports } =
        await this.swapService.swapSolToToken(
          userRecord,
          session.tokenA.address,
          halfLamports.toString()
        );
      if (!result.success) {
        throw new Error(
          `Failed to convert SOL to ${session.tokenA.symbol ?? "Token A"}: ${
            result.error ?? "unknown error"
          }`
        );
      }
      purchasedTokenALamports = new Decimal(tokenAmountLamports);
      conversions.solToTokenSignatures.tokenA = result.signature;
    }

    let purchasedTokenBLamports: Decimal;
    if (session.tokenB.address === SOL_MINT) {
      purchasedTokenBLamports = otherHalfLamports;
    } else {
      const { result, tokenAmountLamports } =
        await this.swapService.swapSolToToken(
          userRecord,
          session.tokenB.address,
          otherHalfLamports.toString()
        );
      if (!result.success) {
        throw new Error(
          `Failed to convert SOL to ${session.tokenB.symbol ?? "Token B"}: ${
            result.error ?? "unknown error"
          }`
        );
      }
      purchasedTokenBLamports = new Decimal(tokenAmountLamports);
      conversions.solToTokenSignatures.tokenB = result.signature;
    }

    if (purchasedTokenALamports.lte(0) || purchasedTokenBLamports.lte(0)) {
      throw new Error(
        "Insufficient token amounts after SOL conversions to recreate position"
      );
    }

    const purchases = {
      tokenALamports: purchasedTokenALamports.toFixed(0),
      tokenBLamports: purchasedTokenBLamports.toFixed(0),
    };

    const tokenADecimals = session.tokenA.decimals;
    const tokenBDecimals = session.tokenB.decimals;

    const tokenAUi = rawToUiAmount(
      purchasedTokenALamports.toString(),
      tokenADecimals
    ).toString();
    const tokenBUi = rawToUiAmount(
      purchasedTokenBLamports.toString(),
      tokenBDecimals
    ).toString();

    const createUseCase = container.get(CreatePositionUseCase);
    const createResult = await createUseCase.execute({
      userId: userRecord.id,
      walletId: userRecord.walletId,
      walletAddress: userRecord.walletAddress,
      dex: session.dex,
      poolAddress: session.poolAddress,
      tokenA: session.tokenA,
      tokenB: session.tokenB,
      tokenAAmount: tokenAUi,
      tokenBAmount: tokenBUi,
      strategy: session.strategy,
      autoRebalance: session.autoRebalance,
      solAmount: totalTokensInSolLamports.toNumber(),
      // FIXME dynamic value
      depositMethod: "sol_auto_convert",
      rebalanceSession: {
        ...session,
        stage: "creating",
        closeSignature: session.closeSignature ?? signature,
        closeSummary: {
          ...closeSummary,
          totalSol: totalTokensInSolLamports.toFixed(0),
        },
        conversions,
        purchases,
      },
    });

    if (!createResult.success || !createResult.signature) {
      throw new Error(
        createResult.error || "Failed to submit rebalance creation transaction"
      );
    }

    const updatedMetadata = {
      ...metadata,
      rebalanceSession: {
        ...session,
        stage: "creating",
        closeSignature: session.closeSignature ?? signature,
        closeSummary: {
          ...closeSummary,
          totalSol: totalTokensInSolLamports.toFixed(0),
        },
        conversions,
        purchases,
        createSignature: createResult.signature,
      },
    };

    await db
      .update(pendingTransactions)
      .set({ metadata: updatedMetadata })
      .where(eq(pendingTransactions.id, pendingTxId));

    logger.info(
      "[TxConfirmWorker] Rebalance close processed; creation submitted",
      {
        signature,
        sessionId: session.sessionId,
        createSignature: createResult.signature,
      }
    );
  }

  private async finalizeRebalanceCreation(params: {
    signature: string;
    session: RebalanceSessionMetadata;
    metadata: any;
    positionContext: PositionCreationContext;
    effectivePositionAddress: string;
    actualTokenAAmount: string;
    actualTokenBAmount: string;
    prices: { tokenAUsd: number; tokenBUsd: number; solUsd: number };
    userId: string;
  }): Promise<void> {
    const {
      signature,
      session,
      metadata,
      positionContext,
      effectivePositionAddress,
      actualTokenAAmount,
      actualTokenBAmount,
      prices,
      userId,
    } = params;

    const positionId = session.positionId;
    const oldPositionAddress =
      session.oldPositionAddress || positionContext.positionAddress;

    if (!positionId || !oldPositionAddress) {
      throw new Error("Rebalance session missing position identifiers");
    }

    const claimedFeesXUi = session.closeSummary?.claimedFeesTokenA
      ? rawToUiAmount(
          session.closeSummary.claimedFeesTokenA,
          session.tokenA.decimals
        ).toString()
      : undefined;
    const claimedFeesYUi = session.closeSummary?.claimedFeesTokenB
      ? rawToUiAmount(
          session.closeSummary.claimedFeesTokenB,
          session.tokenB.decimals
        ).toString()
      : undefined;

    const onChainData = {
      actualTokenAAmount,
      actualTokenBAmount,
      claimedFeesX: claimedFeesXUi,
      claimedFeesY: claimedFeesYUi,
    };

    await rebalancePersistenceService.rebalancePosition({
      signature,
      context: {
        userId: session.userId,
        positionId,
        oldPositionAddress,
        newPositionAddress: effectivePositionAddress,
        triggerReason: session.triggerReason ?? "rebalance",
        tokenAAmount: actualTokenAAmount,
        tokenBAmount: actualTokenBAmount,
        tokenAMint: session.tokenA.address,
        tokenBMint: session.tokenB.address,
        poolAddress: session.poolAddress,
      },
      onChainData,
      prices,
    });

    await this.cache.invalidate(CachePatterns.portfolioPattern(userId));
    await this.cache.invalidate(CachePatterns.positionPattern(positionId));

    const jobQueue = new JobQueueService({ producerOnly: true });

    if (session.autoRebalance) {
      await jobQueue.enqueue(
        JOB_POSITION_MONITOR,
        {
          userId: session.userId,
          positionId,
        },
        {
          repeat: {
            every: 60 * 60 * 60 * 1000,
          },
        }
      );
    }

    const successMessage = [
      "✅ Rebalancing complete!",
      "",
      `${link("View Position", getPositionDeeplink(CONFIG.TELEGRAM.BOT_USERNAME, metadata.dex, effectivePositionAddress))}`,
      "",
      "Your position is now active and earning fees!",
    ].join("\n");

    await jobQueue.enqueue(JOB_NOTIFICATION, {
      userId,
      notification: {
        type: "rebalance",
        title: "Position Rebalanced",
        message: successMessage,
        parseMode: "Markdown",
      },
    });

    const updatedMetadata = {
      ...metadata,
      rebalanceSession: {
        ...session,
        stage: "completed",
        newPositionAddress: effectivePositionAddress,
        createSignature: signature,
      },
    };

    await db
      .update(pendingTransactions)
      .set({ metadata: updatedMetadata })
      .where(eq(pendingTransactions.signature, signature));

    logger.info("[TxConfirmWorker] Rebalance creation finalized", {
      positionId,
      newPositionAddress: effectivePositionAddress,
      signature,
    });
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

      let instructionData: ExtractedClosePositionIxsData | undefined;
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

      const effectiveUserId = closeContext.userId ?? userId;
      const userRecord = effectiveUserId
        ? await db.query.users.findFirst({
            where: eq(users.id, effectiveUserId),
          })
        : null;

      let claimedFeesInSol = new Decimal(0);
      if (userRecord && instructionData) {
        claimedFeesInSol = await this.swapClaimedTokensToSOL(
          userRecord,
          instructionData.claimedFeesTokenA,
          closeContext.tokenA,
          instructionData.claimedFeesTokenB,
          closeContext.tokenB
        );
      }

      let finalTokensInSol = new Decimal(0);
      if (userRecord && instructionData) {
        finalTokensInSol = await this.swapClaimedTokensToSOL(
          userRecord,
          instructionData.finalTokenAAmount,
          closeContext.tokenA,
          instructionData.finalTokenBAmount,
          closeContext.tokenB
        );
      }

      const onChainData = instructionData
        ? {
            finalTokenAAmount: instructionData.finalTokenAAmount,
            finalTokenBAmount: instructionData.finalTokenBAmount,
            claimedFeesX: instructionData.claimedFeesTokenA,
            claimedFeesY: instructionData.claimedFeesTokenB,
            claimedFeesInSol,
            finalTokensInSol,
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
    const solscanUrl = getSolscanLink("tx", signature);

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
  ): ExtractedClosePositionIxsData {
    const removeTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };
    const claimTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };

    let positionAddr: string | undefined;

    for (const instruction of instructions) {
      if (!positionAddr && instruction.accounts?.position) {
        positionAddr = instruction.accounts.position;
      }

      // if (instruction.instructionType === "remove") {
      //   removeInstructionCount += 1;
      // } else if (instruction.instructionType === "claim") {
      //   claimInstructionCount += 1;
      // } else if (instruction.instructionType === "close") {
      //   closeInstructionCount += 1;
      // }

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
          const amountLamports = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenA = removeTotals.tokenA.add(amountLamports);
            // removeTotalsLamports.tokenA =
            // removeTotalsLamports.tokenA.add(amountLamports);
          } else {
            claimTotals.tokenA = claimTotals.tokenA.add(amountLamports);
            // claimTotalsLamports.tokenA =
            // claimTotalsLamports.tokenA.add(amountLamports);
          }
        } else if (transfer.mint === tokenB.address) {
          const amountLamports = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenB = removeTotals.tokenB.add(amountLamports);
            // removeTotalsLamports.tokenB =
            // removeTotalsLamports.tokenB.add(amountLamports);
          } else {
            claimTotals.tokenB = claimTotals.tokenB.add(amountLamports);
            // claimTotalsLamports.tokenB =
            // claimTotalsLamports.tokenB.add(amountLamports);
          }
        }
      }
    }

    return {
      positionAddress: positionAddr,
      finalTokenAAmount: rawToUiAmount(
        removeTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      finalTokenBAmount: rawToUiAmount(
        removeTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
      finalTokenAAmountLamports: removeTotals.tokenA.toString(),
      finalTokenBAmountLamports: removeTotals.tokenB.toString(),
      claimedFeesTokenA: rawToUiAmount(
        claimTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      claimedFeesTokenB: rawToUiAmount(
        claimTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
      claimedFeesTokenALamports: claimTotals.tokenA.toString(),
      claimedFeesTokenBLamports: claimTotals.tokenB.toString(),
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
      claimedFeesTokenA: rawToUiAmount(
        claimTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      claimedFeesTokenB: rawToUiAmount(
        claimTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
    };
  }

  /**
   * Handle SOL→Token swap confirmation:
   * 1. Update pending transaction with swap result
   * 2. Check if both swaps are complete
   * 3. If complete, trigger position creation
   */
  private async handleSwapConfirmation(
    signature: string,
    userId: string
  ): Promise<{ confirmed: boolean; timeout?: boolean }> {
    try {
      const ptx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, signature),
      });

      if (!ptx || !ptx.metadata) {
        logger.error(
          "[TxConfirmWorker] No pending transaction metadata for swap",
          { signature }
        );
        return { confirmed: false };
      }

      const metadata =
        typeof ptx.metadata === "string"
          ? JSON.parse(ptx.metadata)
          : ptx.metadata;

      const swapContext = metadata as SolSwapMetadata;

      if (!swapContext.positionCreationId) {
        logger.error("[TxConfirmWorker] Swap missing position creation ID", {
          signature,
        });
        return { confirmed: false };
      }

      logger.info("[TxConfirmWorker] Processing swap confirmation", {
        signature,
        positionCreationId: swapContext.positionCreationId,
        swapIndex: swapContext.swapIndex,
        outputAmount: swapContext.outputAmount,
      });
      console.log("[TxConfirmWorker] Processing swap confirmation", {
        signature,
        positionCreationId: swapContext.positionCreationId,
        swapIndex: swapContext.swapIndex,
        outputAmount: swapContext.outputAmount,
        outputDecimals: swapContext.outputDecimals,
        expectedOutputAmount: swapContext.expectedOutputAmount,
      });

      await db
        .update(pendingTransactions)
        .set({
          status: "COMPLETED",
        })
        .where(eq(pendingTransactions.signature, signature));

      // Check if both swaps are confirmed for this position creation
      const positionCreationSwaps = await db
        .select()
        .from(pendingTransactions)
        .where(
          and(
            eq(pendingTransactions.operationType, "SOL_TO_TOKEN_SWAP"),
            eq(pendingTransactions.group, swapContext.positionCreationId)
          )
        );

      logger.info("[TxConfirmWorker] Checking swap completion", {
        positionCreationId: swapContext.positionCreationId,
        totalSwaps: positionCreationSwaps.length,
        confirmedSwaps: positionCreationSwaps.length,
      });

      // If both swaps are confirmed, proceed with position creation
      if (positionCreationSwaps.length === 2) {
        await this.proceedWithPositionCreation(
          swapContext.positionCreationId,
          positionCreationSwaps
        );
      }

      return { confirmed: true };
    } catch (error) {
      logger.error("[TxConfirmWorker] Failed to handle swap confirmation", {
        error,
        signature,
        userId,
      });
      return { confirmed: false };
    }
  }

  /**
   * Proceed with position creation after both swaps are confirmed
   */
  private async proceedWithPositionCreation(
    positionCreationId: string,
    confirmedSwaps: PendingTransaction[]
  ): Promise<void> {
    try {
      logger.info(
        "[TxConfirmWorker] Both swaps confirmed, proceeding with position creation",
        {
          positionCreationId,
          swapCount: confirmedSwaps.length,
        }
      );

      const positionTx = await db.query.pendingTransactions.findFirst({
        where: eq(pendingTransactions.signature, positionCreationId),
      });

      if (!positionTx || !positionTx.metadata) {
        logger.error(
          "[TxConfirmWorker] Original position creation context not found",
          { positionCreationId }
        );
        return;
      }

      const positionMetadata =
        typeof positionTx.metadata === "string"
          ? JSON.parse(positionTx.metadata)
          : positionTx.metadata;

      const positionContext =
        positionMetadata.positionContext as PositionCreationContext;
      const command = positionMetadata.command;

      if (!positionContext || !command) {
        logger.error("[TxConfirmWorker] Invalid position creation context", {
          positionCreationId,
        });
        return;
      }

      // Extract actual received amounts from swap confirmations
      const firstSwap = confirmedSwaps.find(
        (s) => (s.metadata as SolSwapMetadata).swapIndex === "first"
      );
      const secondSwap = confirmedSwaps.find(
        (s) => (s.metadata as SolSwapMetadata).swapIndex === "second"
      );

      const actualTokenAAmount = firstSwap
        ? (firstSwap.metadata as SolSwapMetadata).outputAmount
        : command.tokenAAmount;
      const actualTokenBAmount = secondSwap
        ? (secondSwap.metadata as SolSwapMetadata).outputAmount
        : command.tokenBAmount;

      logger.info("[TxConfirmWorker] Using actual swap amounts", {
        positionCreationId,
        actualTokenAAmount,
        actualTokenBAmount,
        expectedTokenAAmount: command.tokenAAmount,
        expectedTokenBAmount: command.tokenBAmount,
      });
      console.log("[TxConfirmWorker] Using actual swap amounts", {
        positionCreationId,
        actualTokenAAmount,
        actualTokenBAmount,
        expectedTokenAAmount: command.tokenAAmount,
        expectedTokenBAmount: command.tokenBAmount,
      });

      // Update position context with actual amounts
      positionContext.tokenAAmount = actualTokenAAmount;
      positionContext.tokenBAmount = actualTokenBAmount;

      // Create the position using received tokens
      const dexRegistryInstance = container.get<typeof dexRegistry>(
        DI_TOKENS.DexRegistry
      );
      const adapter = dexRegistryInstance.get(command.dex);
      const adapterParams: CreatePositionParams = {
        poolAddress: command.poolAddress,
        userAddress: positionContext.walletAddress,
        tokenAAmount: uiToRawAmount(
          actualTokenAAmount,
          positionContext.tokenA.decimals
        ).toString(),
        tokenBAmount: uiToRawAmount(
          actualTokenBAmount,
          positionContext.tokenB.decimals
        ).toString(),
        strategy: command.strategy,
        rangeInterval: 5,
        // slippage: positionContext.slippage,
      };

      console.log("adapterParams", adapterParams);

      const txResult = await adapter.createPositionIxs(adapterParams);

      if (!txResult?.success) {
        throw new Error(
          `Position creation failed after swaps: ${txResult?.error || "Unknown error"}`
        );
      }

      let signature = "";
      try {
        signature = await WalletService.signAndSendViaGateway(
          positionContext.walletId,
          positionContext.walletAddress,
          txResult.instructions,
          [txResult.positionKp]
        );
      } catch (err) {
        logger.error("Position creation transaction submission failed", {
          err,
          positionCreationId,
        });
        throw err;
      }

      if (!signature) {
        throw new Error("Position creation signature missing after submission");
      }

      // Update the original position creation pending transaction
      await db
        .update(pendingTransactions)
        .set({
          signature, // Update with real signature
          status: "PENDING",
          metadata: {
            ...positionMetadata,
            positionContext: {
              ...positionContext,
              positionAddress: txResult.positionKp.publicKey.toBase58(),
            },
          },
        })
        .where(eq(pendingTransactions.signature, positionCreationId));

      // Clean up swap transactions
      for (const swap of confirmedSwaps) {
        await db
          .delete(pendingTransactions)
          .where(eq(pendingTransactions.signature, swap.signature));
      }

      // Enqueue position creation confirmation
      const jobQueue = new JobQueueService({ producerOnly: true });
      await jobQueue.enqueue(
        JOB_TX_CONFIRM,
        {
          signature,
          operationType: "CREATE_POSITION",
          userId: positionContext.userId,
          positionAddress: txResult.positionKp.publicKey.toBase58(),
          submittedAt: Date.now(),
        },
        { delay: 500 }
      );

      logger.info("[TxConfirmWorker] Position creation submitted", {
        positionCreationId,
        signature,
        positionAddress: txResult.positionKp.publicKey.toBase58(),
      });
    } catch (error) {
      console.error(error);
      logger.error(
        "[TxConfirmWorker] Failed to proceed with position creation",
        {
          error,
          positionCreationId,
        }
      );

      // Mark original position creation as failed
      await db
        .update(pendingTransactions)
        .set({
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(pendingTransactions.signature, positionCreationId));
    }
  }

  private async swapClaimedTokensToSOL(
    user: User,
    tokenAAmount: string,
    tokenA: Token,
    tokenBAmount: string,
    tokenB: Token
  ): Promise<Decimal> {
    try {
      let solReceivedDecimal = new Decimal(0);

      const claimedFeesTokenALamports = uiToRawAmount(
        tokenAAmount,
        tokenA.decimals
      );
      const claimedFeesTokenBLamports = uiToRawAmount(
        tokenBAmount,
        tokenB.decimals
      );

      // Swap token A fees to SOL if not already SOL and amount > 0
      if (
        claimedFeesTokenALamports > BigInt(0) &&
        tokenA.address !== SOL_MINT
      ) {
        try {
          const swapResultA = await this.swapService.swapTokenToSol(
            user,
            tokenA.address,
            claimedFeesTokenALamports.toString()
          );
          if (swapResultA.result.success) {
            solReceivedDecimal = solReceivedDecimal.add(
              swapResultA.solReceived
            );
            console.info("[TxConfirmWorker] Swapped token A fees to SOL", {
              tokenA: tokenA.address,
              amount: claimedFeesTokenALamports.toString(),
              solReceived: swapResultA.solReceived.toString(),
            });
          } else {
            console.warn(
              "[TxConfirmWorker] Failed to swap token A fees to SOL",
              {
                tokenA: tokenA.address,
                error: swapResultA.result.error,
              }
            );
          }
        } catch (error) {
          console.error(
            "[TxConfirmWorker] Error swapping token A fees to SOL",
            {
              tokenA: tokenA.address,
              error,
            }
          );
        }
      } else if (
        claimedFeesTokenALamports > BigInt(0) &&
        tokenA.address === SOL_MINT
      ) {
        // Token A is already SOL, just add to total
        solReceivedDecimal = solReceivedDecimal.add(
          lamportsToSol(claimedFeesTokenALamports)
        );
      }

      // Swap token B fees to SOL if not already SOL and amount > 0
      if (
        claimedFeesTokenBLamports > BigInt(0) &&
        tokenB.address !== SOL_MINT
      ) {
        try {
          const swapResultB = await this.swapService.swapTokenToSol(
            user,
            tokenB.address,
            claimedFeesTokenBLamports.toString()
          );
          if (swapResultB.result.success) {
            solReceivedDecimal = solReceivedDecimal.add(
              swapResultB.solReceived
            );
            console.info("[TxConfirmWorker] Swapped token B fees to SOL", {
              tokenB: tokenB.address,
              amount: claimedFeesTokenBLamports.toString(),
              solReceived: swapResultB.solReceived.toString(),
            });
          } else {
            console.warn(
              "[TxConfirmWorker] Failed to swap token B fees to SOL",
              {
                tokenB: tokenB.address,
                error: swapResultB.result.error,
              }
            );
          }
        } catch (error) {
          console.error(
            "[TxConfirmWorker] Error swapping token B fees to SOL",
            {
              tokenB: tokenB.address,
              error,
            }
          );
        }
      } else if (
        claimedFeesTokenBLamports > BigInt(0) &&
        tokenB.address === SOL_MINT
      ) {
        // Token B is already SOL, just add to total
        solReceivedDecimal = solReceivedDecimal.add(
          lamportsToSol(claimedFeesTokenBLamports)
        );
      }

      return solReceivedDecimal;
    } catch (error) {
      console.error({
        error,
      });
      logger.error("[TxConfirmWorker] Failed to proceed with position claim", {
        error,
      });

      return new Decimal(0);
    }
  }
}
