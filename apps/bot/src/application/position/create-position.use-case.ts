import { IPositionRepository } from '@/domain/position/position.repository';
import { validatePoolAddress, validateWalletAddress } from '@/domain/position/position.validators';
import { DexType, CreatePositionParams, TransactionResult } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { logger } from '@/utils/logger';
import { db, pendingTransactions } from '@/db';
import { JobQueueService } from '@/infrastructure/jobs/job-queue.service';
import { JOB_TX_CONFIRM } from '@/infrastructure/jobs/job-definitions';

export interface DexRegistryLike {
  get(dexType: DexType): IDexAdapter;
}

export interface CreatePositionCommand {
  // Domain/user context
  userId: string;
  dex: DexType;

  // On-chain context
  poolAddress: string;
  userAddress: string; // wallet public key (base58)
  walletId?: string;   // optional Privy wallet id if a transaction service needs it

  // Amounts (UI amounts as strings)
  tokenAAmount: string;
  tokenBAmount: string;

  // Optional execution params
  strategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}

export interface CreatePositionResult {
  success: boolean;
  signature?: string;
  // On-chain position PDA/address if known at build time (adapter may include it in metadata)
  positionId?: string;
  error?: string;
}

/**
 * Responsible for orchestrating the creation of a position on a specific DEX.
 * Flow:
 *  - Validate input
 *  - Build create-position transaction via DEX adapter
 *  - Submit transaction (adapter may already submit depending on implementation)
 *  - Record pending transaction in DB for async processing
 *  - Enqueue background job to process and persist full position details
 */
export interface ITransactionService {
  submit(built: any, context: { userId: string; walletId?: string; userAddress: string }): Promise<string>;
}

import { getCacheService, ICacheService } from '@/infrastructure/cache/cache.service';
import { CachePatterns } from '@/infrastructure/cache/cache-keys';

export class CreatePositionUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly transactionService: ITransactionService,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  async execute(command: CreatePositionCommand): Promise<CreatePositionResult> {
    try {
      // Basic validation
      if (!command?.userId) {
        return { success: false, error: 'User ID is required' };
      }

      validatePoolAddress(command.poolAddress);
      validateWalletAddress(command.userAddress);

      if (!command.tokenAAmount || parseFloat(command.tokenAAmount) <= 0) {
        return { success: false, error: 'tokenAAmount must be greater than 0' };
      }
      if (!command.tokenBAmount || parseFloat(command.tokenBAmount) <= 0) {
        return { success: false, error: 'tokenBAmount must be greater than 0' };
      }

      // Resolve adapter
      const adapter = this.dexRegistry.get(command.dex);

      // Build params for adapter
      const adapterParams: CreatePositionParams = {
        poolAddress: command.poolAddress,
        userAddress: command.userAddress,
        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,
        strategy: command.strategy,
        slippage: command.slippage,
        metadata: command.metadata,
      };

      // Create position via adapter
      // Note: According to plan, adapter should build tx and return it without submitting.
      // However, current adapter implementations may submit and return a signature directly.
      let txResult: TransactionResult;
      try {
        txResult = await adapter.createPosition(adapterParams);
      } catch (error) {
        logger.error('Adapter.createPosition failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create position transaction',
        };
      }

      if (!txResult?.success) {
        return {
          success: false,
          error: txResult?.error || 'Create position failed',
        };
      }

      let signature = txResult.signature as string | undefined;

      if (!signature) {
        // If adapter did not submit and only returned a built tx, try to submit via transaction service
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
        return {
          success: false,
          error: 'Transaction signature missing after submission attempt',
        };
      }

      // Persist a pending transaction record so background processor can enrich and create DB position
      try {
        const metadata = {
          dex: command.dex,
          poolAddress: command.poolAddress,
          userAddress: command.userAddress,
          strategy: command.strategy,
          extras: txResult.metadata ?? command.metadata ?? {},
        } as Record<string, any>;

        await db.insert(pendingTransactions).values({
          signature,
          operationType: 'CREATE_POSITION',
          userId: command.userId,
          status: 'PENDING',
          metadata: JSON.stringify(metadata),
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error('Failed to insert pending transaction', { err });
        return {
          success: false,
          error: 'Failed to persist pending transaction for processing',
        };
      }

      // Enqueue transaction confirmation job
      try {
        const jobQueue = new JobQueueService();
        await jobQueue.enqueue(JOB_TX_CONFIRM, {
          signature,
          operationType: 'CREATE_POSITION',
          userId: command.userId,
          submittedAt: Date.now(),
        }, { delay: 500 });
      } catch (err) {
        logger.error('Failed to enqueue transaction confirmation job', { err });
        // We do not fail the whole flow if the job enqueue fails; consumers can retry enqueueing.
      }

      // If adapter returned a position address in metadata, pass it through for immediate UI linking
      const positionId =
        (txResult.metadata && (txResult.metadata['positionAddress'] as string)) ||
        (command.metadata && (command.metadata['positionAddress'] as string));

      try {
        // Invalidate portfolio cache for this user
        await this.cache.invalidate(CachePatterns.portfolioPattern(command.userId));
      } catch {}

      return {
        success: true,
        signature,
        positionId,
      };
    } catch (error) {
      logger.error('CreatePositionUseCase.execute unexpected error', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
