/**
 * Create Position Orchestrator Use Case
 * 
 * Enhanced version that integrates:
 * - Error handling framework (ADR-001)
 * - Strategy pattern (ADR-002)
 * - State machine (ADR-003)
 * - Idempotency (ADR-004)
 */

import { logger } from "@/utils/logger";
import { db, pendingTransactions } from "@/db";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { DexType, CreatePositionParams, Token } from "@/types/core.types";
import { WalletService } from "@/services/wallet.service";
import { uiToRawAmount } from "@/utils/number-utils";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import {
  InvalidPositionAmountError,
  InvalidPoolError,
  AdapterError,
  TransactionSimulationError,
  SignatureRejectedError,
  InternalPositionError,
  PositionPersistenceError,
  PositionError,
} from "@/domain/position";
import { strategyRegistry } from "@/domain/strategies/strategy-registry";
import {
  FlowStateMachine,
  FlowRepository,
} from "@/services/flows/flow-state-machine";
import {
  FlowType,
  CreatePositionState,
  CreatePositionCheckpoint,
  generateIdempotencyKey,
} from "@/services/flows/flow-types";
import { ICacheService, getCacheService } from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";

export interface CreatePositionOrchestratorCommand {
  // User context
  userId: string;
  walletId: string;
  walletAddress: string;
  
  // Pool context
  dex: DexType;
  poolAddress: string;
  tokenA: Token;
  tokenB: Token;
  
  // Amounts (UI amounts as strings)
  tokenAAmount: string;
  tokenBAmount: string;
  
  // Strategy and configuration
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;
  
  // Price range
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };
  
  // Risk management
  autoRebalance?: boolean;
  rebalanceThreshold?: number;
  slippage?: number;
  slPercentage?: string;
  tpPercentage?: string;
  
  // Optional rebalance session
  rebalanceSession?: any;
}

export interface CreatePositionOrchestratorResult {
  success: boolean;
  flowId?: string;
  signature?: string;
  positionAddress?: string;
  error?: string;
}

export interface DexRegistryLike {
  get(dexType: DexType): IDexAdapter;
}

export class CreatePositionOrchestratorUseCase {
  private readonly cache: ICacheService;
  private readonly flowRepository: FlowRepository;
  private readonly jobQueue: JobQueueService;

  constructor(
    private readonly dexRegistry: DexRegistryLike,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
    this.flowRepository = new FlowRepository();
    this.jobQueue = new JobQueueService({ producerOnly: true });
  }

  /**
   * Execute position creation with full framework integration
   */
  async execute(
    command: CreatePositionOrchestratorCommand
  ): Promise<CreatePositionOrchestratorResult> {
    try {
      // 1. Validate inputs using error framework
      this.validateInputs(command);

      // 2. Get strategy instance
      const strategy = strategyRegistry.getOrDefault(command.strategy);
      
      logger.info(
        {
          userId: command.userId,
          poolAddress: command.poolAddress,
          dex: command.dex,
          strategy: strategy.metadata.name,
        },
        "[CreatePositionOrchestrator] Starting position creation"
      );

      // 3. Generate idempotency key (ADR-004)
      const idempotencyKey = generateIdempotencyKey({
        userId: command.userId,
        flowType: FlowType.CREATE_POSITION,
        intent: `${command.poolAddress}:${command.tokenAAmount}:${command.tokenBAmount}`,
      });

      // 4. Check if already exists (idempotency)
      const existing = await this.flowRepository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info(
          { idempotencyKey, existingFlowId: existing.id },
          "[CreatePositionOrchestrator] Found existing flow with same idempotency key"
        );
        
        return {
          success: existing.status === "COMPLETED",
          flowId: existing.id,
          signature: existing.signature,
          error: existing.status === "FAILED" ? "Previous attempt failed" : undefined,
        };
      }

      // 5. Initialize state machine (ADR-003)
      const checkpoint: CreatePositionCheckpoint = {
        poolAddress: command.poolAddress,
        dex: command.dex,
        tokenA: command.tokenA,
        tokenB: command.tokenB,
        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,
        strategy: strategy.metadata.name,
        depositMethod: command.depositMethod,
        solAmount: command.solAmount,
        rebalanceSession: command.rebalanceSession,
      };

      const flow = await FlowStateMachine.start(
        {
          flowType: FlowType.CREATE_POSITION,
          maxRetries: 3,
          timeoutMs: 10 * 60 * 1000, // 10 minutes
          steps: [], // Steps handled by worker
        },
        this.flowRepository,
        {
          userId: command.userId,
          walletAddress: command.walletAddress,
          walletId: command.walletId,
          flowType: FlowType.CREATE_POSITION,
          metadata: checkpoint,
          intent: `${command.poolAddress}:${command.tokenAAmount}:${command.tokenBAmount}`,
        }
      );

      logger.info(
        { flowId: flow.flowId, idempotencyKey },
        "[CreatePositionOrchestrator] Flow initialized"
      );

      // 6. Build transaction using adapter
      const adapter = this.dexRegistry.get(command.dex);
      
      const adapterParams: CreatePositionParams = {
        poolAddress: command.poolAddress,
        userAddress: command.walletAddress,
        tokenAAmount: uiToRawAmount(
          command.tokenAAmount,
          command.tokenA.decimals
        ).toString(),
        tokenBAmount: uiToRawAmount(
          command.tokenBAmount,
          command.tokenB.decimals
        ).toString(),
        strategy: strategy.metadata.name,
      };

      let txResult;
      try {
        txResult = await adapter.createPositionIxs(adapterParams);
        
        if (!txResult?.success) {
          throw new AdapterError(
            command.dex,
            "createPosition",
            new Error(txResult?.error || "Unknown adapter error"),
            false
          );
        }
      } catch (error) {
        if (error instanceof PositionError) {
          throw error;
        }
        throw new AdapterError(
          command.dex,
          "createPosition",
          error instanceof Error ? error : new Error(String(error)),
          true
        );
      }

      // 7. Submit transaction
      let signature: string;
      try {
        signature = await WalletService.signAndSendViaGateway(
          command.walletId,
          command.walletAddress,
          txResult.instructions,
          [txResult.positionKp]
        );
      } catch (error) {
        logger.error({ error, command }, "[CreatePositionOrchestrator] Transaction submission failed");
        
        // Check if user rejected
        if (error instanceof Error && error.message.includes("rejected")) {
          throw new SignatureRejectedError(command.walletAddress);
        }
        
        throw new InternalPositionError(
          "Failed to submit transaction",
          { originalError: error instanceof Error ? error.message : String(error) }
        );
      }

      const positionAddress = txResult.positionKp.publicKey.toBase58();

      logger.info(
        { flowId: flow.flowId, signature, positionAddress },
        "[CreatePositionOrchestrator] Transaction submitted"
      );

      // 8. Update flow with transaction info
      await flow.recordSignature(signature);

      // 9. Save pending transaction with full context
      const positionContext = {
        userId: command.userId,
        walletId: command.walletId,
        walletAddress: command.walletAddress,
        dex: command.dex,
        poolAddress: command.poolAddress,
        tokenA: command.tokenA,
        tokenB: command.tokenB,
        strategy: strategy.metadata.name,
        depositMethod: command.depositMethod ?? "sol_auto_convert",
        depositSource: command.depositSource,
        solAmount: command.solAmount,
        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,
        autoRebalance: command.autoRebalance ?? false,
        slippage: command.slippage,
        positionAddress,
        priceRange: command.priceRange,
        rebalanceSession: command.rebalanceSession,
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: "CREATE_POSITION",
          userId: command.userId,
          status: "PENDING",
          idempotencyKey,
          metadata: {
            command,
            positionContext,
            flowId: flow.flowId,
          },
          retryCount: 0,
          maxRetries: 3,
        });
      } catch (error) {
        throw new PositionPersistenceError(
          "save_pending_transaction",
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // 10. Enqueue confirmation job
      try {
        await this.jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: "CREATE_POSITION",
            userId: command.userId,
            positionAddress,
            flowId: flow.flowId,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (error) {
        logger.error(
          { error, signature },
          "[CreatePositionOrchestrator] Failed to enqueue confirmation job"
        );
        // Non-fatal - worker will pick it up via pending transactions
      }

      // 11. Invalidate cache
      try {
        await this.cache.invalidate(CachePatterns.portfolioPattern(command.userId));
      } catch (error) {
        logger.debug(
          { error },
          "[CreatePositionOrchestrator] Failed to invalidate cache"
        );
        // Non-fatal
      }

      return {
        success: true,
        flowId: flow.flowId,
        signature,
        positionAddress,
      };
    } catch (error) {
      // Error handling (ADR-001)
      if (error instanceof PositionError) {
        logger.warn(
          {
            error: error.message,
            code: error.code,
            category: error.category,
            retryable: error.retryable,
            userId: command.userId,
          },
          "[CreatePositionOrchestrator] Position error"
        );
        
        return {
          success: false,
          error: error.userMessage,
        };
      }

      // Unknown error - wrap and log
      logger.error(
        { error, command },
        "[CreatePositionOrchestrator] Unexpected error"
      );

      return {
        success: false,
        error: "An unexpected error occurred. Please try again later.",
      };
    }
  }

  /**
   * Validate inputs using error framework (ADR-001)
   */
  private validateInputs(command: CreatePositionOrchestratorCommand): void {
    // Validate wallet
    if (!command.walletId || !command.walletAddress) {
      throw new InternalPositionError("WalletId and WalletAddress are required");
    }

    // Validate pool
    if (!command.poolAddress) {
      throw new InvalidPoolError(command.poolAddress, command.dex);
    }

    // Validate amounts
    const tokenAAmount = parseFloat(command.tokenAAmount);
    if (!tokenAAmount || tokenAAmount <= 0) {
      throw new InvalidPositionAmountError(tokenAAmount, 0.000001);
    }

    const tokenBAmount = parseFloat(command.tokenBAmount);
    if (!tokenBAmount || tokenBAmount <= 0) {
      throw new InvalidPositionAmountError(tokenBAmount, 0.000001);
    }

    // Add more validation as needed (balance checks, etc.)
  }
}
