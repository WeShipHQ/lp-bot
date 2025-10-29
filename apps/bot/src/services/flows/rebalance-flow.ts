/**
 * Rebalance Flow Definition
 *
 * State machine for rebalancing a position.
 */

import {
  FlowType,
  RebalanceState,
  RebalanceCheckpoint,
  FlowContext,
} from "./flow-types";
import { FlowStateMachine, FlowRepository } from "./flow-state-machine";
import { logger } from "@/utils/logger";

export interface RebalanceFlowParams {
  userId: string;
  walletAddress: string;
  walletId: string;
  positionId: string;
  oldPositionAddress: string;
  reason: string;
}

export const rebalanceFlowDefinition = {
  flowType: FlowType.REBALANCE,
  maxRetries: 5,
  timeoutMs: 15 * 60 * 1000,
  steps: [
    {
      name: "validate",
      state: RebalanceState.VALIDATING,
      handler: async (context: FlowContext<RebalanceCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[RebalanceFlow] Validating context");

        const checkpoint = context.checkpointData;
        if (!checkpoint.positionId || !checkpoint.oldPositionAddress) {
          return { success: false, error: "Missing position metadata" };
        }

        return {
          success: true,
          state: RebalanceState.CLOSING_OLD_POSITION,
        };
      },
    },
    {
      name: "close_old_position",
      state: RebalanceState.CLOSING_OLD_POSITION,
      handler: async () => ({
        success: true,
        state: RebalanceState.OLD_POSITION_CLOSED,
        data: { awaitingCloseConfirmation: true },
      }),
      asyncWait: true,
    },
    {
      name: "claim_fees",
      state: RebalanceState.CLAIMING_FEES,
      handler: async () => ({
        success: true,
        state: RebalanceState.FEES_CLAIMED,
        data: { awaitingClaimConfirmation: true },
      }),
      asyncWait: true,
    },
    {
      name: "create_new_position",
      state: RebalanceState.CREATING_NEW_POSITION,
      handler: async () => ({
        success: true,
        state: RebalanceState.NEW_POSITION_CREATED,
        data: { awaitingCreateConfirmation: true },
      }),
      asyncWait: true,
    },
    {
      name: "persist",
      state: RebalanceState.PERSISTING,
      handler: async () => ({
        success: true,
        state: RebalanceState.COMPLETED,
      }),
    },
  ],
};

export async function startRebalanceFlow(
  params: RebalanceFlowParams,
  repository?: FlowRepository
): Promise<FlowStateMachine> {
  const repo = repository ?? new FlowRepository();

  const checkpoint: RebalanceCheckpoint = {
    positionId: params.positionId,
    oldPositionAddress: params.oldPositionAddress,
    reason: params.reason,
  };

  return FlowStateMachine.start(rebalanceFlowDefinition, repo, {
    userId: params.userId,
    walletAddress: params.walletAddress,
    walletId: params.walletId,
    flowType: FlowType.REBALANCE,
    intent: `${params.positionId}:${params.reason}`,
    metadata: {
      initialState: RebalanceState.VALIDATING,
      checkpointData: checkpoint,
    },
  });
}
