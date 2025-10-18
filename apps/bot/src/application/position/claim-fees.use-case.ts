import { IPositionRepository } from '@/domain/position/position.repository';
import { validateWalletAddress } from '@/domain/position/position.validators';
import { DexType, TransactionResult } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { logger } from '@/utils/logger';
import { db, pendingTransactions } from '@/db';
import { JobQueueService } from '@/infrastructure/jobs/job-queue.service';
import { JOB_TX_CONFIRM } from '@/infrastructure/jobs/job-definitions';
import { DexRegistryLike, ITransactionService } from './create-position.use-case';
import { Money } from '@/domain/shared/value-objects';

export interface ClaimFeesCommand {
  userId: string;
  positionId: string;
  userAddress: string; // wallet public key (base58)
  walletId?: string;
}

export interface ClaimFeesResult {
  success: boolean;
  signature?: string;
  claimedFeesUsd?: number;
  error?: string;
}

import { getCacheService, ICacheService } from '@/infrastructure/cache/cache.service';
import { CachePatterns } from '@/infrastructure/cache/cache-keys';

export class ClaimFeesUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly transactionService: ITransactionService,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  async execute(command: ClaimFeesCommand): Promise<ClaimFeesResult> {
    try {
      if (!command?.userId) {
        return { success: false, error: 'User ID is required' };
      }
      if (!command?.positionId) {
        return { success: false, error: 'Position ID is required' };
      }
      validateWalletAddress(command.userAddress);

      const position = await this.positionRepository.findById(command.positionId);
      if (!position) {
        return { success: false, error: 'Position not found' };
      }
      if (position.userId !== command.userId) {
        return { success: false, error: 'Unauthorized: position does not belong to user' };
      }

      const dexType: DexType = position.dex;
      const positionAddress = position.positionAddress;

      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      // Try to fetch unclaimed fees before claiming to update domain optimistically
      let estimatedUnclaimedFeesUsd = 0;
      try {
        const onchain = await adapter.getPosition(positionAddress);
        estimatedUnclaimedFeesUsd = Number(onchain.unclaimedFeesUsd || 0);
      } catch (e) {
        // Non-fatal; proceed without pre-estimate
        logger.warn('Failed to fetch on-chain position prior to claim', { e });
      }

      let txResult: TransactionResult;
      try {
        txResult = await adapter.claimFees(positionAddress as string, {
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
        } as any);
      } catch (error) {
        logger.error('Adapter.claimFees failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to build claim fees transaction',
        };
      }

      if (!txResult?.success) {
        return { success: false, error: txResult?.error || 'Claim fees failed' };
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

      // Record pending transaction
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
          operationType: 'CLAIM_FEES',
          userId: command.userId,
          status: 'PENDING',
          metadata: JSON.stringify(metadata),
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error('Failed to insert pending transaction (claim fees)', { err });
        return { success: false, error: 'Failed to persist pending transaction for processing' };
      }

      // Optimistically add claimed fees to domain using pre-claim estimate
      try {
        if (estimatedUnclaimedFeesUsd > 0) {
          position.addClaimedFees(Money.usd(estimatedUnclaimedFeesUsd));
          await this.positionRepository.update(position);
          // Invalidate caches impacted by position update
          await this.cache.invalidate(CachePatterns.positionPattern(command.positionId));
          await this.cache.invalidate(CachePatterns.portfolioPattern(command.userId));
        }
      } catch (err) {
        logger.error('Failed to update position claimed fees', { err });
        // Not fatal; processor can reconcile later
      }

      // Enqueue confirmation job
      try {
        const jobQueue = new JobQueueService();
        await jobQueue.enqueue(JOB_TX_CONFIRM, {
          signature,
          operationType: 'CLAIM_FEES',
          userId: command.userId,
          positionId: command.positionId,
          submittedAt: Date.now(),
        }, { delay: 500 });
      } catch (err) {
        logger.error('Failed to enqueue transaction confirmation job (claim)', { err });
      }

      return { success: true, signature, claimedFeesUsd: estimatedUnclaimedFeesUsd };
    } catch (error) {
      logger.error('ClaimFeesUseCase.execute unexpected error', { error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
