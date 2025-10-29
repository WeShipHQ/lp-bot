/**
 * Close Position Flow Definition
 * 
 * State machine for closing a liquidity position.
 */

import {
  FlowType,
  ClosePositionState,
  ClosePositionCheckpoint,
  FlowContext,
} from "./flow-types";
import { FlowStateMachine, FlowRepository } from "./flow-state-machine";
import { logger } from "@/utils/logger";

export interface ClosePositionFlowParams {
  userId: string;
  walletAddress: string;
  walletId: string;
  positionId: string;
  positionAddress: string;
  autoConvertToSol: boolean;
}

export const closePositionFlowDefinition = {
  flowType: FlowType.CLOSE_POSITION,
  maxRetries: 3,
  timeoutMs: 10 * 60 * 1000,
  steps: [
    {
      name: "validate",
      state: ClosePositionState.VALIDATING,
      handler: async (context: FlowContext<ClosePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[ClosePositionFlow] Validating context");

        const checkpoint = context.checkpointData;
        if (!checkpoint.positionId || !checkpoint.positionAddress) {
          return { success: false, error: "Missing position metadata" };
        }

        return {
          success: true,
          state: ClosePositionState.BUILDING_TX,
        };
      },
    },
    {
      name: "build_transaction",
      state: ClosePositionState.BUILDING_TX,
      handler: async () => ({
        success: true,
        state: ClosePositionState.TX_SUBMITTED,
        data: { awaitingTxSubmission: true },
      }),
      asyncWait: true,
    },
    {
      name: "confirm_transaction",
      state: ClosePositionState.TX_CONFIRMING,
      handler: async () => ({
        success: true,
        state: ClosePositionState.TX_CONFIRMED,
      }),
      asyncWait: true,
    },
    {
      name: "persist",
      state: ClosePositionState.PERSISTING,
      handler: async () => ({
        success: true,
        state: ClosePositionState.COMPLETED,
      }),
    },
  ],
};

export async function startClosePositionFlow(
  params: ClosePositionFlowParams,
  repository?: FlowRepository
): Promise<FlowStateMachine> {
  const repo = repository ?? new FlowRepository();

  const checkpoint: ClosePositionCheckpoint = {
    positionId: params.positionId,
    positionAddress: params.positionAddress,
    autoConvertToSol: params.autoConvertToSol,
  };

  return FlowStateMachine.start(closePositionFlowDefinition, repo, {
    userId: params.userId,
    walletAddress: params.walletAddress,
    walletId: params.walletId,
    flowType: FlowType.CLOSE_POSITION,
    intent: params.positionId,
    metadata: {
      initialState: ClosePositionState.VALIDATING,
      checkpointData: checkpoint,
    },
  });
}
