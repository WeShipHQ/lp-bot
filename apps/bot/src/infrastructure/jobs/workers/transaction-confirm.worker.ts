import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { TransactionConfirmJobData, JOB_POSITION_MONITOR, JOB_NOTIFICATION } from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions } from "@/db";
import { eq } from "drizzle-orm";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import { PositionCreationContext } from "@/application/position/create-position.use-case";
import { positionPersistenceService } from "@/services/position-persistence.service";
import { getTokenPriceService } from "@/services/token-price.service";
import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { getCacheService } from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";

export class TransactionConfirmWorker implements IWorker<TransactionConfirmJobData> {
  private readonly priceService = getTokenPriceService();
  private readonly meteoraAdapter = new MeteoraAdapter();
  private readonly cache = getCacheService();

  constructor(
    private readonly solana: SolanaAdapter,
    private readonly positionRepository: PositionRepository,
  ) {}

  async process(job: Job<TransactionConfirmJobData>) {
    const { signature, operationType, userId, positionId, positionAddress, submittedAt } = job.data;
    const started = Date.now();

    try {
      const status = await this.solana.getSignatureStatus(signature);
      if (!status || (!status.confirmationStatus && !status.err)) {
        // Pending/no info: decide on retry vs timeout
        const [ptx] = await db.select().from(pendingTransactions).where(eq(pendingTransactions.signature, signature));
        const created = ptx?.createdAt || (submittedAt ? new Date(submittedAt) : new Date(Date.now() - 1000));
        const ageMs = Date.now() - new Date(created).getTime();
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        if (ageMs > timeoutMs) {
          await db.update(pendingTransactions)
            .set({ status: 'FAILED', updatedAt: new Date(), errorMessage: 'Timeout while waiting for confirmation' })
            .where(eq(pendingTransactions.signature, signature));
          logger.warn({ signature }, '[TxConfirmWorker] Marked as FAILED due to timeout');
          return { confirmed: false, timeout: true };
        }
        // Re-throw to trigger retry/backoff
        throw new Error('Pending confirmation');
      }

      if (status?.err) {
        await db.update(pendingTransactions)
          .set({ status: 'FAILED', updatedAt: new Date(), errorMessage: JSON.stringify(status.err) })
          .where(eq(pendingTransactions.signature, signature));
        logger.warn({ signature }, '[TxConfirmWorker] Transaction failed');
        return { confirmed: false, failed: true };
      }

      // Consider confirmed once confirmationStatus present and not "processed"
      await db.update(pendingTransactions)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(pendingTransactions.signature, signature));

      // Domain side-effects based on operation type
      try {
        if (operationType === 'CREATE_POSITION') {
          await this.handleCreatePosition(signature, userId, positionAddress);
        } else if (operationType === 'REBALANCE') {
          let pos = positionId ? await this.positionRepository.findById(positionId) : null;
          if (!pos && positionAddress) {
            pos = await this.positionRepository.findByPositionAddress(positionAddress);
          }
          if (pos) {
            pos.completeRebalancing();
            await this.positionRepository.update(pos);
          }
        } else if (operationType === 'CLOSE_POSITION') {
          let pos = positionId ? await this.positionRepository.findById(positionId) : null;
          if (!pos && positionAddress) pos = await this.positionRepository.findByPositionAddress(positionAddress);
          if (pos && !pos.isClosed()) {
            pos.close();
            await this.positionRepository.update(pos);
          }
        }
      } catch (err) {
        logger.warn({ err }, '[TxConfirmWorker] Post-confirm side-effects failed');
      }

      const duration = Date.now() - started;
      logger.info({ signature, operationType, duration }, '[TxConfirmWorker] Confirmed');
      return { confirmed: true, status };
    } catch (error) {
      logger.debug({ error, signature }, '[TxConfirmWorker] Pending or error');
      throw error; // rely on backoff/attempts
    }
  }

  /**
   * Handle CREATE_POSITION confirmation
   * Enrich position data from on-chain and create DB records
   */
  private async handleCreatePosition(
    signature: string,
    userId: string,
    positionAddress?: string
  ): Promise<void> {
    try {
      const [ptx] = await db
        .select()
        .from(pendingTransactions)
        .where(eq(pendingTransactions.signature, signature))
        .limit(1);

      if (!ptx || !ptx.metadata) {
        logger.error('[TxConfirmWorker] No pending transaction metadata found', { signature });
        return;
      }

      const metadata = JSON.parse(ptx.metadata);
      const context: PositionCreationContext | undefined = metadata.positionContext;

      if (!context) {
        logger.error('[TxConfirmWorker] No position context in metadata', { signature });
        return;
      }

      const effectivePositionAddress = positionAddress ?? context.positionAddress;
      if (!effectivePositionAddress) {
        logger.error('[TxConfirmWorker] Position address not available', { signature });
        return;
      }

      logger.info('[TxConfirmWorker] Enriching position data from on-chain', {
        signature,
        positionAddress: effectivePositionAddress,
        poolAddress: context.poolAddress,
      });

      let onChainData: any = undefined;
      try {
        const position = await this.meteoraAdapter.getPosition(effectivePositionAddress, {
          userAddress: context.walletAddress,
          poolAddress: context.poolAddress,
        });

        if (position) {
          onChainData = {
            actualTokenAAmount: position.tokenAAmount,
            actualTokenBAmount: position.tokenBAmount,
            lowerBinId: position.metadata?.lowerBinId as number | undefined,
            upperBinId: position.metadata?.upperBinId as number | undefined,
          };
        }
      } catch (err) {
        logger.warn('[TxConfirmWorker] Failed to fetch on-chain position data', {
          err,
          positionAddress: effectivePositionAddress,
        });
      }

      const tokenMints = [context.tokenAMint, context.tokenBMint];
      const solMint = 'So11111111111111111111111111111111111111112';
      if (!tokenMints.includes(solMint)) {
        tokenMints.push(solMint);
      }

      const priceData = await this.priceService.getPrices(tokenMints);
      const prices = {
        tokenAUsd: priceData[context.tokenAMint]?.price ?? 0,
        tokenBUsd: priceData[context.tokenBMint]?.price ?? 0,
        solUsd: priceData[solMint]?.price ?? 0,
      };

      logger.info('[TxConfirmWorker] Fetched token prices', { prices });

      const createdPositionId = await positionPersistenceService.createPosition({
        signature,
        positionAddress: effectivePositionAddress,
        context,
        onChainData,
        prices,
      });

      logger.info('[TxConfirmWorker] Position created in database', {
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
        logger.info('[TxConfirmWorker] Position monitoring job scheduled', {
          positionId: createdPositionId,
        });
      }

      await jobQueue.enqueue(JOB_NOTIFICATION, {
        userId,
        notification: {
          type: 'general',
          title: 'Position Created',
          message: `Your position has been successfully created! View it in your portfolio.`,
        },
      });

      logger.info('[TxConfirmWorker] CREATE_POSITION handled successfully', {
        positionId: createdPositionId,
        signature,
      });
    } catch (error) {
      logger.error('[TxConfirmWorker] Failed to handle CREATE_POSITION', {
        error,
        signature,
        userId,
        positionAddress,
      });
      throw error;
    }
  }
}
