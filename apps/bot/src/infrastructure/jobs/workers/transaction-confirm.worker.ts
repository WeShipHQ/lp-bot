import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  TransactionConfirmJobData,
  JOB_POSITION_MONITOR,
  JOB_NOTIFICATION,
} from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions } from "@/db";
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
import { PositionClosureContext } from "@/application";

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

      const metadata = ptx.metadata as any;
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
          actualTokenAAmount = (
            tokenATransfer.amount / Math.pow(10, context.tokenA.decimals ?? 9)
          ).toString();
        }
        if (tokenBTransfer) {
          actualTokenBAmount = (
            tokenBTransfer.amount / Math.pow(10, context.tokenB.decimals ?? 9)
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

      const tokenMints = [context.tokenA.address, context.tokenB.address];
      const solMint = "So11111111111111111111111111111111111111112";
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
      const solMint = "So11111111111111111111111111111111111111112";
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
      const effectivePositionAddress =
        closeContext.positionAddress ?? positionAddress;

      if (!effectivePositionId || !effectivePositionAddress) {
        logger.error("[TxConfirmWorker] Insufficient data to handle close", {
          signature,
          closeContext,
        });
        return;
      }

      const solMint = "So11111111111111111111111111111111111111112";
      const priceData = await this.priceService.getPrices([
        closeContext.tokenAMint,
        closeContext.tokenBMint,
        solMint,
      ]);

      const prices = {
        tokenAUsd: priceData[closeContext.tokenAMint]?.price ?? 0,
        tokenBUsd: priceData[closeContext.tokenBMint]?.price ?? 0,
        solUsd: priceData[solMint]?.price ?? 0,
      };

      await closePositionPersistenceService.closePosition({
        signature,
        context: {
          userId: closeContext.userId ?? userId,
          positionId: effectivePositionId,
          positionAddress: effectivePositionAddress,
          poolAddress: closeContext.poolAddress,
          closureReason: closeContext.closureReason ?? "user_close",
          tokenAMint: closeContext.tokenAMint,
          tokenBMint: closeContext.tokenBMint,
        },
        onChainData: {
          finalTokenAAmount: closeContext.finalTokenAAmount ?? "0",
          finalTokenBAmount: closeContext.finalTokenBAmount ?? "0",
          claimedFeesX: closeContext.unclaimedFeeXAmount ?? "0",
          claimedFeesY: closeContext.unclaimedFeeYAmount ?? "0",
        },
        prices,
      });

      await this.cache.invalidate(CachePatterns.portfolioPattern(userId));
      await this.cache.invalidate(
        CachePatterns.positionPattern(effectivePositionId)
      );

      const jobQueue = new JobQueueService({ producerOnly: true });
      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId,
        notification: {
          type: "general",
          title: "Position Closed",
          message: `Position ${effectivePositionAddress} has been closed successfully.`,
        },
      });

      logger.info("[TxConfirmWorker] CLOSE_POSITION handled successfully", {
        signature,
        positionId: effectivePositionId,
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
}
