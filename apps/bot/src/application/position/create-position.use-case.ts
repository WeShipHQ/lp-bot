import {
  validatePoolAddress,
  validateWalletAddress,
} from "@/domain/position/position.validators";
import {
  DexType,
  CreatePositionParams,
  CreatePositionResult as CreatePositionResultType,
} from "@/types/core.types";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, User } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";

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
  tokenA: Token;
  tokenB: Token;
  strategy: string;

  // Deposit details
  depositMethod: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;

  // Token amounts (UI amounts)
  tokenAAmount: string;
  tokenBAmount: string;

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
  // quotes?: {
  //   solUsd?: number;
  //   tokenAUsd?: number;
  //   tokenBUsd?: number;
  // };

  // Transaction metadata
  expectedFeesLamports?: number;
  slippage?: number;

  // Position address from adapter (if available before confirmation)
  positionAddress?: string;

  // Optional rebalance metadata when creation is part of a rebalance flow
  rebalanceSession?: RebalanceSessionMetadata;
}

export interface CreatePositionCommand {
  // Domain/user context
  user: User;
  dex: DexType;

  // On-chain context
  poolAddress: string;
  tokenA: Token;
  tokenB: Token;

  // Amounts (UI amounts as strings)
  tokenAAmount: string;
  tokenBAmount: string;

  // Optional execution params
  strategy?: string;
  slippage?: number;
  autoRebalance?: boolean;
  depositMethod?: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;

  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };

  rebalanceSession?: RebalanceSessionMetadata;
}

// Remove this interface as it's now defined in core.types.ts

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
  submit(
    built: any,
    context: { userId: string; walletId?: string; userAddress: string }
  ): Promise<string>;
}

import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";
import { WalletService } from "@/services/wallet.service";
import { Token } from "@/types/token.types";
import Decimal from "decimal.js";

export class CreatePositionUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly dexRegistry: DexRegistryLike,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  async execute(command: CreatePositionCommand): Promise<CreatePositionResult> {
    try {
      if (!command?.user) {
        return { success: false, error: "User is required" };
      }

      validatePoolAddress(command.poolAddress);
      validateWalletAddress(command.user.walletAddress);

      if (!command.tokenAAmount || parseFloat(command.tokenAAmount) <= 0) {
        return { success: false, error: "tokenAAmount must be greater than 0" };
      }
      if (!command.tokenBAmount || parseFloat(command.tokenBAmount) <= 0) {
        return { success: false, error: "tokenBAmount must be greater than 0" };
      }

      const adapter = this.dexRegistry.get(command.dex);

      const adapterParams: CreatePositionParams = {
        poolAddress: command.poolAddress,
        userAddress: command.user.walletAddress,
        tokenAAmount: new Decimal(command.tokenAAmount)
          .mul(Decimal.pow(10, command.tokenA.decimals))
          .toString(),
        tokenBAmount: new Decimal(command.tokenBAmount)
          .mul(Decimal.pow(10, command.tokenB.decimals))
          .toString(),
        strategy: command.strategy,
        slippage: command.slippage,
      };

      let txResult: CreatePositionResultType;
      try {
        txResult = await adapter.createPositionIx(adapterParams);
      } catch (error) {
        logger.error("Adapter.createPositionIx failed", { error, command });
        console.log("Adapter.createPositionIx failed", { error, command });
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to create position transaction",
        };
      }

      if (!txResult?.success) {
        return {
          success: false,
          error: txResult?.error || "Create position failed",
        };
      }

      let signature = "" as string | undefined;
      try {
        signature = await WalletService.signAndSendTransactionWithJito(
          command.user,
          txResult.instructions,
          [txResult.positionKp],
          []
        );
      } catch (err) {
        console.log("Transaction submission failed", { err, command });
        logger.error("Transaction submission failed", { err, command });
      }

      if (!signature) {
        return {
          success: false,
          error: "Transaction signature missing after submission attempt",
        };
      }

      const adapterPositionAddress = txResult.positionKp.publicKey.toBase58();

      const positionContext: PositionCreationContext = {
        userId: command.user.id,
        walletId: command.user.walletId,
        walletAddress: command.user.walletAddress,

        dex: command.dex,
        poolAddress: command.poolAddress,
        tokenA: command.tokenA,
        tokenB: command.tokenB,
        strategy: command.strategy ?? "spot",

        depositMethod: command.depositMethod ?? "sol_auto_convert",
        depositSource: command.depositSource,
        solAmount: command.solAmount,

        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,

        autoRebalance: command.autoRebalance ?? false,
        slippage: command.slippage,

        positionAddress: adapterPositionAddress,
        priceRange: command.priceRange,
        rebalanceSession: command.rebalanceSession,
      };

      const pendingMetadata = {
        command: {
          userId: command.user.id,
          dex: command.dex,
          poolAddress: command.poolAddress,
          strategy: command.strategy,
          tokenAAmount: command.tokenAAmount,
          tokenBAmount: command.tokenBAmount,
        },
        positionContext,
        rebalanceSession: command.rebalanceSession,
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: "CREATE_POSITION",
          userId: command.user.id,
          status: "PENDING",
          metadata: pendingMetadata,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (err) {
        logger.error("Failed to insert pending transaction", {
          err,
          signature,
          pendingMetadata,
        });
        return {
          success: false,
          error: "Failed to persist pending transaction for processing",
        };
      }

      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: "CREATE_POSITION",
            userId: command.user.id,
            positionAddress: extractedData.positionAddress || adapterPositionAddress,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (err) {
        logger.error("Failed to enqueue transaction confirmation job", {
          err,
          signature,
        });
      }

      try {
        await this.cache.invalidate(
          CachePatterns.portfolioPattern(command.user.id)
        );
      } catch (cacheError) {
        logger.debug("Failed to invalidate portfolio cache", {
          userId: command.user.id,
          cacheError,
        });
      }

      return {
        success: true,
        signature,
        positionAddress:
          positionContext?.positionAddress ?? adapterPositionAddress,
      };
    } catch (error) {
      logger.error("CreatePositionUseCase.execute unexpected error", {
        error,
        command,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
