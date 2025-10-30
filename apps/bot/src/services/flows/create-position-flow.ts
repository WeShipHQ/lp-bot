/**
 * Create Position Flow Definition
 * 
 * Defines the explicit state machine for creating a liquidity position.
 * Integrated with ADR-001 (Error Framework) and ADR-002 (Strategy Pattern).
 */

import {
  FlowType,
  CreatePositionState,
  CreatePositionCheckpoint,
  FlowContext,
  FlowResult,
} from "./flow-types";
import { logger } from "@/utils/logger";
import { FlowStateMachine, FlowRepository } from "./flow-state-machine";
import {
  InvalidPositionAmountError,
  InvalidPoolError,
  StrategyValidationError,
} from "@/domain/position";
import { strategyRegistry } from "@/domain/strategies/strategy-registry";

export interface CreatePositionFlowParams {
  userId: string;
  walletAddress: string;
  walletId: string;
  poolAddress: string;
  dex: string;
  tokenA: any;
  tokenB: any;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  solAmount?: number;
  autoRebalance?: boolean;
  rebalanceSession?: any;
}

/**
 * Create Position Flow Definition
 */
export const createPositionFlowDefinition = {
  flowType: FlowType.CREATE_POSITION,
  maxRetries: 3,
  timeoutMs: 10 * 60 * 1000, // 10 minutes
  steps: [
    {
      name: "validate",
      state: CreatePositionState.VALIDATING,
      handler: async (context: FlowContext<CreatePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[CreatePositionFlow] Validating inputs");

        try {
          const checkpoint = context.checkpointData;

          // Validate required fields
          if (!checkpoint.poolAddress) {
            throw new InvalidPoolError("", checkpoint.dex ?? "meteora");
          }

          if (!checkpoint.tokenA || !checkpoint.tokenB) {
            throw new InvalidPositionAmountError(0, 0.000001);
          }

          const tokenAAmount = parseFloat(checkpoint.tokenAAmount);
          const tokenBAmount = parseFloat(checkpoint.tokenBAmount);

          if (!tokenAAmount || tokenAAmount <= 0) {
            throw new InvalidPositionAmountError(tokenAAmount, 0.000001);
          }

          if (!tokenBAmount || tokenBAmount <= 0) {
            throw new InvalidPositionAmountError(tokenBAmount, 0.000001);
          }

          // Strategy validation (ADR-002)
          const strategy = strategyRegistry.getOrDefault(checkpoint.strategy);
          const validation = await strategy.validateDepositPlan?.({
            tokenAAmount,
            tokenBAmount,
            depositMode: checkpoint.depositMethod ?? "sol_auto_convert",
            poolAddress: checkpoint.poolAddress,
          });

          if (validation && !validation.valid) {
            throw new StrategyValidationError(strategy.metadata.name, validation.error ?? "Invalid configuration");
          }

          return {
            success: true,
            state: CreatePositionState.BUILDING_TX,
          };
        } catch (error) {
          if (error instanceof InvalidPositionAmountError || error instanceof InvalidPoolError || error instanceof StrategyValidationError) {
            return {
              success: false,
              error: error.userMessage ?? error.message,
            };
          }

          throw error;
        }
      },
    },
    {
      name: "build_transaction",
      state: CreatePositionState.BUILDING_TX,
      handler: async (context: FlowContext<CreatePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[CreatePositionFlow] Building transaction");

        // This step needs to be called from use case with adapter
        // Here we mark as ready for external processing

        return {
          success: true,
          state: CreatePositionState.TX_SUBMITTED,
          data: {
            awaitingTxSubmission: true,
          },
        };
      },
      asyncWait: true, // Wait for external tx submission
    },
    {
      name: "confirm_transaction",
      state: CreatePositionState.TX_CONFIRMING,
      handler: async (context: FlowContext<CreatePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[CreatePositionFlow] Confirming transaction");

        // Transaction confirmation handled by TransactionConfirmWorker
        // This step waits for external confirmation

        return {
          success: true,
          state: CreatePositionState.TX_CONFIRMED,
        };
      },
      asyncWait: true, // Wait for blockchain confirmation
    },
    {
      name: "persist_position",
      state: CreatePositionState.PERSISTING,
      handler: async (context: FlowContext<CreatePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[CreatePositionFlow] Persisting position");

        // Position persistence handled by TransactionConfirmWorker
        // after on-chain confirmation

        return {
          success: true,
          state: CreatePositionState.COMPLETED,
        };
      },
    },
  ],
};

/**
 * Helper to start a Create Position flow
 */
export async function startCreatePositionFlow(
  params: CreatePositionFlowParams,
  repository?: FlowRepository
): Promise<FlowStateMachine> {
  const repo = repository ?? new FlowRepository();

  const checkpoint: CreatePositionCheckpoint = {
    poolAddress: params.poolAddress,
    dex: params.dex,
    tokenA: params.tokenA,
    tokenB: params.tokenB,
    tokenAAmount: params.tokenAAmount,
    tokenBAmount: params.tokenBAmount,
    strategy: params.strategy,
    depositMethod: params.depositMethod,
    solAmount: params.solAmount,
    rebalanceSession: params.rebalanceSession,
  };

  return FlowStateMachine.start(createPositionFlowDefinition, repo, {
    userId: params.userId,
    walletAddress: params.walletAddress,
    walletId: params.walletId,
    flowType: FlowType.CREATE_POSITION,
    intent: params.poolAddress, // Use poolAddress as intent for idempotency
    metadata: {
      initialState: CreatePositionState.VALIDATING,
      checkpointData: checkpoint,
      poolAddress: params.poolAddress,
      autoRebalance: params.autoRebalance,
    },
  });
}
