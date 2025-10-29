/**
 * XState Persistence Adapter
 * 
 * Adapts XState machine state to our database persistence layer.
 * Enables state snapshots and restoration.
 */

import { State, StateMachine, AnyStateMachine } from "xstate";
import { FlowRepository } from "../flow-state-machine";
import { FlowType } from "../flow-types";
import { logger } from "@/utils/logger";

export interface PersistenceOptions {
  flowId: string;
  flowType: FlowType;
  userId: string;
  walletAddress: string;
  walletId?: string;
  intent: string;
}

/**
 * Persists XState machine state to database
 */
export async function persistMachineState<T>(
  state: State<T>,
  options: PersistenceOptions,
  repository: FlowRepository
): Promise<void> {
  const flow = await repository.findById(options.flowId);
  
  if (!flow) {
    logger.error({ flowId: options.flowId }, "[FlowPersistence] Flow not found");
    return;
  }

  // Extract state value (can be string or object for nested states)
  const stateValue = typeof state.value === "string" 
    ? state.value 
    : JSON.stringify(state.value);

  // Update flow checkpoint with XState snapshot
  flow.currentState = stateValue as any;
  flow.checkpoint.checkpointData = {
    ...flow.checkpoint.checkpointData,
    xstateSnapshot: state.toJSON(),
    context: state.context,
  };

  if (state.matches("completed")) {
    await repository.markCompleted(options.flowId);
  } else if (state.matches("failed")) {
    const error = (state.context as any).error || "Unknown error";
    await repository.markFailed(options.flowId, error);
  } else {
    await repository.update(flow);
  }

  logger.debug(
    { flowId: options.flowId, state: stateValue },
    "[FlowPersistence] State persisted"
  );
}

/**
 * Restores XState machine state from database
 */
export async function restoreMachineState<T>(
  machine: AnyStateMachine,
  flowId: string,
  repository: FlowRepository
): Promise<State<T> | null> {
  const flow = await repository.findById(flowId);
  
  if (!flow) {
    return null;
  }

  const snapshot = flow.checkpoint.checkpointData?.xstateSnapshot;
  
  if (!snapshot) {
    // No XState snapshot, create initial state with persisted context
    const context = flow.checkpoint.checkpointData || {};
    return State.create(machine.initialState, context) as State<T>;
  }

  // Restore from snapshot
  return State.create(snapshot) as State<T>;
}

/**
 * Auto-persist middleware for XState interpreter
 */
export function createAutoPersistMiddleware(
  options: PersistenceOptions,
  repository: FlowRepository
) {
  return (state: State<any>) => {
    // Don't await to avoid blocking state transitions
    persistMachineState(state, options, repository).catch((error) => {
      logger.error(
        { error, flowId: options.flowId },
        "[FlowPersistence] Auto-persist failed"
      );
    });
  };
}
