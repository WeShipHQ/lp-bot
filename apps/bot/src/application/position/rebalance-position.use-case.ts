import { IPositionRepository } from '@/domain/position/position.repository';
import { validateWalletAddress } from '@/domain/position/position.validators';
import { DexType, RebalanceParams, TransactionResult } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { logger } from '@/utils/logger';
import { db, pendingTransactions } from '@/db';
import { JobQueueService } from '@/infrastructure/jobs/job-queue.service';
import { JOB_TX_CONFIRM } from '@/infrastructure/jobs/job-definitions';
import { DexRegistryLike, ITransactionService } from './create-position.use-case';

export interface RebalancePositionCommand {
  userId: string;
  positionId: string;
  userAddress: string; // wallet public key (base58)
  walletId?: string;
  // Optional execution params
  newStrategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}

export interface RebalancePositionResult {
  success: boolean;
  signature?: string;
  newPositionAddress?: string;
  error?: string;
}

export class RebalancePositionUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly transactionService: ITransactionService
  ) {}

  async execute(command: RebalancePositionCommand): Promise<RebalancePositionResult> {
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

      const unifiedPosition = await adapter.getPosition(positionAddress, {
        userAddress: command.userAddress,
        poolAddress: position.poolAddress,
      });

      const currentTokenAAmount = unifiedPosition?.tokenAAmount ?? String(position.initialTokenXAmount);
      const currentTokenBAmount = unifiedPosition?.tokenBAmount ?? String(position.initialTokenYAmount);

      const strategyForMetadata =
        command.newStrategy ?? (position as any).strategyType ?? 'spot';

      const rangeInterval =
        (command.metadata?.rangeInterval as number | undefined) ?? 10;

      const params: RebalanceParams = {
        newStrategy: command.newStrategy,
        slippage: command.slippage,
        metadata: {
          ...(command.metadata ?? {}),
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
          tokenAAmount: currentTokenAAmount,
          tokenBAmount: currentTokenBAmount,
          strategy: strategyForMetadata,
          rangeInterval,
        },
      };

      let txResult: TransactionResult;
      try {
        txResult = await adapter.rebalancePosition(positionAddress, params);
      } catch (error) {
        logger.error('Adapter.rebalancePosition failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to build rebalance transaction',
        };
      }

      if (!txResult?.success) {
        return { success: false, error: txResult?.error || 'Rebalance position failed' };
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

      // Record pending transaction for async processing
      try {
        const rebalanceContext = {
          positionId: command.positionId,
          userId: command.userId,
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
          dex: dexType,
          oldPositionAddress: positionAddress,
          tokenAMint: (position.tokenX as any).mint || (position.tokenX as any).address,
          tokenBMint: (position.tokenY as any).mint || (position.tokenY as any).address,
          tokenASymbol: (position.tokenX as any).symbol,
          tokenBSymbol: (position.tokenY as any).symbol,
          tokenADecimals: (position.tokenX as any).decimals,
          tokenBDecimals: (position.tokenY as any).decimals,
          triggerReason: (command.metadata?.trigger as string) ?? 'manual',
        };

        const metadata = {
          command: {
            positionId: command.positionId,
            userId: command.userId,
            dex: dexType,
            oldPositionAddress: positionAddress,
            poolAddress: position.poolAddress,
          },
          adapterMetadata: txResult.metadata ?? {},
          rebalanceContext,
        };

        await db.insert(pendingTransactions).values({
          signature,
          operationType: 'REBALANCE',
          userId: command.userId,
          status: 'PENDING',
          metadata: JSON.stringify(metadata),
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error('Failed to insert pending transaction (rebalance)', { err });
        return { success: false, error: 'Failed to persist pending transaction for processing' };
      }

      // Optimistically mark position as REBALANCING (will be returned to ACTIVE after completion)
      try {
        position.startRebalancing();
        await this.positionRepository.update(position);
      } catch (err) {
        logger.error('Failed to update position status to REBALANCING', { err });
      }

      // Enqueue confirmation job
      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(JOB_TX_CONFIRM, {
          signature,
          operationType: 'REBALANCE',
          userId: command.userId,
          positionId: command.positionId,
          submittedAt: Date.now(),
        }, { delay: 500 });
      } catch (err) {
        logger.error('Failed to enqueue transaction confirmation job (rebalance)', { err });
      }

      // Invalidate caches optimistically
      try {
        const { getCacheService } = await import('@/infrastructure/cache/cache.service');
        const { CachePatterns } = await import('@/infrastructure/cache/cache-keys');
        const cache = getCacheService();
        await cache.invalidate(CachePatterns.portfolioPattern(command.userId));
        await cache.invalidate(CachePatterns.positionPattern(command.positionId));
      } catch {}

      const newPositionAddress = txResult.metadata?.['newPositionAddress'] as string | undefined;
      return { success: true, signature, newPositionAddress };
    } catch (error) {
      logger.error('RebalancePositionUseCase.execute unexpected error', { error });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}
