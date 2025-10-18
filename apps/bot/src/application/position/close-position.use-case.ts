import { IPositionRepository } from '@/domain/position/position.repository';
import { validateWalletAddress } from '@/domain/position/position.validators';
import { DexType, TransactionResult } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { logger } from '@/utils/logger';
import { db, pendingTransactions } from '@/db';
import { JobQueueService } from '@/services/job-queue.service';
import { DexRegistryLike, ITransactionService } from './create-position.use-case';

export interface ClosePositionCommand {
  // Required to identify ownership and for pending tx record
  userId: string;

  // Source of truth for which position to close
  positionId: string;

  // Execution context for submission (if adapter does not submit)
  userAddress: string; // wallet public key (base58)
  walletId?: string; // optional Privy wallet id if needed by transaction service
}

export interface ClosePositionResult {
  success: boolean;
  signature?: string;
  error?: string;
}

import { getCacheService, ICacheService } from '@/infrastructure/cache/cache.service';
import { CachePatterns, CacheKeys } from '@/infrastructure/cache/cache-keys';

export class ClosePositionUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly transactionService: ITransactionService,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  async execute(command: ClosePositionCommand): Promise<ClosePositionResult> {
    try {
      if (!command?.userId) {
        return { success: false, error: 'User ID is required' };
      }
      if (!command?.positionId) {
        return { success: false, error: 'Position ID is required' };
      }
      validateWalletAddress(command.userAddress);

      // Load position from repository to resolve dex and position address
      const position = await this.positionRepository.findById(command.positionId);
      if (!position) {
        return { success: false, error: 'Position not found' };
      }
      if (position.userId !== command.userId) {
        return { success: false, error: 'Unauthorized: position does not belong to user' };
      }

      const dexType: DexType = position.dex;
      const positionAddress = position.positionAddress;

      // Resolve adapter and build/execute close transaction
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let txResult: TransactionResult;
      try {
        txResult = await adapter.closePosition(positionAddress);
      } catch (error) {
        logger.error('Adapter.closePosition failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to build close transaction',
        };
      }

      if (!txResult?.success) {
        return { success: false, error: txResult?.error || 'Close position failed' };
      }

      let signature = txResult.signature as string | undefined;
      if (!signature) {
        try {
          signature = await this.transactionService.submit(txResult.metadata ?? {}, {
            userId: command.userId,
            walletId: command.walletId,
            userAddress: command.userAddress,
          });
        } catch (err) {
          logger.error('Transaction submission failed', { err });
        }
      }

      if (!signature) {
        return { success: false, error: 'Transaction signature missing after submission attempt' };
      }

      // Record pending transaction for async processing/observability
      try {
        const metadata = {
          dex: dexType,
          positionAddress,
          poolAddress: position.poolAddress,
          userAddress: command.userAddress,
          extras: txResult.metadata ?? {},
        } as Record<string, any>;

        await db.insert(pendingTransactions).values({
          signature,
          operationType: 'CLOSE_POSITION',
          userId: command.userId,
          status: 'PENDING',
          metadata: JSON.stringify(metadata),
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error('Failed to insert pending transaction (close)', { err });
        return { success: false, error: 'Failed to persist pending transaction for processing' };
      }

      // Optimistically mark position as closed at application level
      try {
        position.close();
        // Note: we are not able to set closure signature via domain mapping yet
        await this.positionRepository.update(position);
      } catch (err) {
        logger.error('Failed to update position status to CLOSED', { err });
        // Do not fail the overall flow; background processor may reconcile later
      }

      // Enqueue processing job (even if not fully implemented for CLOSE yet)
      try {
        const jobQueue = new JobQueueService();
        await jobQueue.queueTransactionProcessingJob(
          { signature, operationType: 'CLOSE_POSITION', userId: command.userId },
          500
        );
      } catch (err) {
        logger.error('Failed to enqueue transaction processing job (close)', { err });
      }

      try {
        // Invalidate caches: portfolio for user and this position
        await this.cache.invalidate(CachePatterns.portfolioPattern(command.userId));
        await this.cache.invalidate(CachePatterns.positionPattern(command.positionId));
      } catch {}

      return { success: true, signature };
    } catch (error) {
      logger.error('ClosePositionUseCase.execute unexpected error', { error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
