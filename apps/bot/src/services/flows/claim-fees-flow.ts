/**
 * Claim Fees Flow Definition
 *
 * State machine for the fee claiming process.
 */

import {
  FlowType,
  ClaimFeesState,
  ClaimFeesCheckpoint,
  FlowContext,
} from "./flow-types";
import { FlowStateMachine, FlowRepository } from "./flow-state-machine";
import { logger } from "@/utils/logger";

export interface ClaimFeesFlowParams {
  userId: string;
  walletAddress: string;
  walletId: string;
  positionId: string;
  positionAddress: string;
  autoConvertToSol: boolean;
}

export const claimFeesFlowDefinition = {
  flowType: FlowType.CLAIM_FEES,
  maxRetries: 3,
  timeoutMs: 5 * 60 * 1000,
  steps: [
    {
      name: "validate",
      state: ClaimFeesState.VALIDATING,
      handler: async (context: FlowContext<ClaimFeesCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[ClaimFeesFlow] Validating context");

        const checkpoint = context.checkpointData;
        if (!checkpoint.positionId || !checkpoint.positionAddress) {
          return { success: false, error: "Missing position metadata" };
        }

        return {
          success: true,
          state: ClaimFeesState.BUILDING_TX,
        };
      },
    },
    {
      name: "build_transaction",
      state: ClaimFeesState.BUILDING_TX,
      handler: async () => ({
        success: true,
        state: ClaimFeesState.TX_SUBMITTED,
        data: { awaitingTxSubmission: true },
      }),
      asyncWait: true,
    },
    {
      name: "confirm_transaction",
      state: ClaimFeesState.TX_CONFIRMING,
      handler: async () => ({
        success: true,
        state: ClaimFeesState.TX_CONFIRMED,
      }),
      asyncWait: true,
    },
    {
      name: "persist",
      state: ClaimFeesState.PERSISTING,
      handler: async () => ({
        success: true,
        state: ClaimFeesState.COMPLETED,
      }),
    },
  ],
};

export async function startClaimFeesFlow(
  params: ClaimFeesFlowParams,
  repository?: FlowRepository
): Promise<FlowStateMachine> {
  const repo = repository ?? new FlowRepository();

  const checkpoint: ClaimFeesCheckpoint = {
    positionId: params.positionId,
    positionAddress: params.positionAddress,
    autoConvertToSol: params.autoConvertToSol,
  };

  return FlowStateMachine.start(claimFeesFlowDefinition, repo, {
    userId: params.userId,
    walletAddress: params.walletAddress,
    walletId: params.walletId,
    flowType: FlowType.CLAIM_FEES,
    intent: params.positionId,
    metadata: {
      initialState: ClaimFeesState.VALIDATING,
      checkpointData: checkpoint,
    },
  });
}
