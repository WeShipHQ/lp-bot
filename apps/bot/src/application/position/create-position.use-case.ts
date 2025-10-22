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

/**
 * PositionCreationContext: Complete metadata for position creation
 * This is stored in pendingTransactions and used by the worker to create DB records
 */
export interface PositionCreationContext {
  // User context
  userId: string;
  walletAddress: string;
  walletId?: string;

  // Pool context
  dex: DexType;
  poolAddress: string;
  strategy: string;

  // Deposit details
  depositMethod: 'sol_auto_convert' | 'single_sided';
  depositSource?: 'sol_convert' | 'token_balance';
  solAmount?: number;

  // Token amounts (UI amounts)
  tokenAAmount: string;
  tokenBAmount: string;
  tokenAMint: string;
  tokenBMint: string;
  tokenASymbol?: string;
  tokenBSymbol?: string;
  tokenADecimals?: number;
  tokenBDecimals?: number;

  // Price range
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };

  // Risk management
  autoRebalance: boolean;
  rebalanceThreshold?: number;
  slPercentage?: number;
  tpPercentage?: number;

  // Price quotes (for USD conversion)
  quotes?: {
    solUsd?: number;
    tokenAUsd?: number;
    tokenBUsd?: number;
  };

  // Transaction metadata
  expectedFeesLamports?: number;
  slippage?: number;

  // Position address from adapter (if available before confirmation)
  positionAddress?: string;
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
  positionAddress?: string;
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

      const adapter = this.dexRegistry.get(command.dex);

      const adapterParams: CreatePositionParams = {
        poolAddress: command.poolAddress,
        userAddress: command.userAddress,
        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,
        strategy: command.strategy,
        slippage: command.slippage,
        metadata: command.metadata,
      };

      let txResult: TransactionResult;
      try {
        txResult = await adapter.createPosition(adapterParams);
      } catch (error) {
        logger.error('Adapter.createPosition failed', { error, command });
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
        try {
          signature = await this.transactionService.submit(txResult.metadata ?? {}, {
            userId: command.userId,
            walletId: command.walletId,
            userAddress: command.userAddress,
          });
        } catch (err) {
          logger.error('Transaction submission failed', { err, command });
        }
      }

      if (!signature) {
        return {
          success: false,
          error: 'Transaction signature missing after submission attempt',
        };
      }

      const adapterPositionAddress =
        (txResult.metadata && (txResult.metadata['positionPublicKey'] as string)) ||
        (txResult.metadata && (txResult.metadata['positionAddress'] as string));

      const rawContext = (command.metadata?.positionContext ?? command.metadata) as
        | PositionCreationContext
        | undefined;

      const positionContext: PositionCreationContext | undefined = rawContext
        ? {
            ...rawContext,
            userId: rawContext.userId ?? command.userId,
            walletAddress: rawContext.walletAddress ?? command.userAddress,
            dex: rawContext.dex ?? command.dex,
            poolAddress: rawContext.poolAddress ?? command.poolAddress,
            strategy: rawContext.strategy ?? (command.strategy ?? ''),
            tokenAAmount: rawContext.tokenAAmount ?? command.tokenAAmount,
            tokenBAmount: rawContext.tokenBAmount ?? command.tokenBAmount,
            autoRebalance: rawContext.autoRebalance ?? false,
            slippage: rawContext.slippage ?? command.slippage,
            positionAddress: rawContext.positionAddress ?? adapterPositionAddress ?? undefined,
          }
        : undefined;

      const pendingMetadata = {
        command: {
          userId: command.userId,
          dex: command.dex,
          poolAddress: command.poolAddress,
          strategy: command.strategy,
          tokenAAmount: command.tokenAAmount,
          tokenBAmount: command.tokenBAmount,
        },
        adapterMetadata: txResult.metadata ?? {},
        positionContext,
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: 'CREATE_POSITION',
          userId: command.userId,
          status: 'PENDING',
          metadata: JSON.stringify(pendingMetadata),
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error('Failed to insert pending transaction', { err, signature, pendingMetadata });
        return {
          success: false,
          error: 'Failed to persist pending transaction for processing',
        };
      }

      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: 'CREATE_POSITION',
            userId: command.userId,
            positionAddress: positionContext?.positionAddress ?? adapterPositionAddress,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (err) {
        logger.error('Failed to enqueue transaction confirmation job', { err, signature });
      }

      try {
        await this.cache.invalidate(CachePatterns.portfolioPattern(command.userId));
      } catch (cacheError) {
        logger.debug('Failed to invalidate portfolio cache', {
          userId: command.userId,
          cacheError,
        });
      }

      return {
        success: true,
        signature,
        positionAddress: positionContext?.positionAddress ?? adapterPositionAddress,
      };
    } catch (error) {
      logger.error('CreatePositionUseCase.execute unexpected error', { error, command });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
