/**
 * Flow Runner Worker
 *
 * Orchestrates flow state machine execution step-by-step.
 */

import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  JOB_FLOW_RUNNER,
  JOB_FLOW_CLEANUP,
  FlowRunnerJobData,
} from "../job-definitions";
import {
  FlowRepository,
  FlowStateMachine,
} from "@/services/flows/flow-state-machine";
import {
  FlowType,
  FlowState,
  CreatePositionState,
  ClaimFeesState,
  ClosePositionState,
  RebalanceState,
} from "@/services/flows/flow-types";
import {
  createPositionFlowDefinition,
  claimFeesFlowDefinition,
  closePositionFlowDefinition,
  rebalanceFlowDefinition,
} from "@/services/flows";
import { logger } from "@/utils/logger";
import { JobQueueService } from "../job-queue.service";

const WAITING_STATES = new Set<FlowState>([
  CreatePositionState.TX_SUBMITTED,
  CreatePositionState.TX_CONFIRMING,
  CreatePositionState.SWAP_PENDING,
  ClaimFeesState.TX_SUBMITTED,
  ClaimFeesState.TX_CONFIRMING,
  ClaimFeesState.SWAP_PENDING,
  ClosePositionState.TX_SUBMITTED,
  ClosePositionState.TX_CONFIRMING,
  ClosePositionState.SWAP_PENDING,
  RebalanceState.CLOSING_OLD_POSITION,
  RebalanceState.CLAIMING_FEES,
  RebalanceState.CREATING_NEW_POSITION,
]);

const flowDefinitionMap = {
  [FlowType.CREATE_POSITION]: createPositionFlowDefinition,
  [FlowType.CLAIM_FEES]: claimFeesFlowDefinition,
  [FlowType.CLOSE_POSITION]: closePositionFlowDefinition,
  [FlowType.REBALANCE]: rebalanceFlowDefinition,
  [FlowType.SOL_TO_TOKEN_SWAP]: createPositionFlowDefinition, // Reuse for swap auxiliary flows
};

export class FlowRunnerWorker implements IWorker<FlowRunnerJobData> {
  private readonly repository: FlowRepository;

  constructor(private readonly jobQueue?: JobQueueService) {
    this.repository = new FlowRepository();
  }

  async process(job: Job<FlowRunnerJobData>) {
    const { flowId, flowType } = job.data;
    const definition = flowDefinitionMap[flowType];

    if (!definition) {
      logger.error({ flowId, flowType }, "[FlowRunnerWorker] No definition for flow type");
      return { success: false, reason: "no_definition" };
    }

    try {
      const machine = new FlowStateMachine(definition, this.repository, flowId);
      const result = await machine.run();

      if (!result.success) {
        logger.warn({ flowId, flowType, error: result.error }, "[FlowRunnerWorker] Flow step failed");

        // Schedule cleanup if flow failed
        if (this.jobQueue) {
          await this.jobQueue.enqueue(JOB_FLOW_CLEANUP, { flowId });
        }

        return result;
      }

      const currentState = result.state;

      if (!currentState || currentState === "COMPLETED") {
        logger.info({ flowId, flowType }, "[FlowRunnerWorker] Flow completed");
        return result;
      }

      if (WAITING_STATES.has(currentState)) {
        logger.info(
          { flowId, flowType, state: currentState },
          "[FlowRunnerWorker] Flow awaiting external event"
        );
        // Do not re-enqueue; external event will trigger next step
        return { success: true, awaiting: true, state: currentState };
      }

      // Re-enqueue for next step with slight delay to avoid tight loops
      if (this.jobQueue) {
        await this.jobQueue.enqueue(JOB_FLOW_RUNNER, { flowId, flowType }, { delay: 250 });
      }

      return { success: true, state: currentState };
    } catch (error) {
      logger.error({ error, data: job.data }, "[FlowRunnerWorker] Error executing flow");
      throw error;
    }
  }
}
