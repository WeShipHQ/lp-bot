/**
 * Close Position Flow Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { startClosePositionFlow, closePositionFlowDefinition } from "../close-position-flow";
import { FlowStateMachine } from "../flow-state-machine";
import { ClosePositionState, FlowEvent } from "../flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POSITION_ID,
  TEST_POSITION_ADDRESS,
} from "./fixtures";

describe("Close Position Flow", () => {
  let repository: MockFlowRepository;

  beforeEach(() => {
    repository = new MockFlowRepository();
  });

  const baseParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    positionId: TEST_POSITION_ID,
    positionAddress: TEST_POSITION_ADDRESS,
    autoConvertToSol: true,
  });

  it("transitions from VALIDATING to BUILDING_TX", async () => {
    const machine = await startClosePositionFlow(baseParams(), repository);
    const result = await machine.run();

    expect(result.success).toBe(true);
    expect(result.state).toBe(ClosePositionState.BUILDING_TX);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.currentState).toBe(ClosePositionState.BUILDING_TX);
  });

  it("fails validation when position metadata missing", async () => {
    const machine = await startClosePositionFlow(
      {
        ...baseParams(),
        positionAddress: "",
      },
      repository
    );

    const result = await machine.run();

    expect(result.success).toBe(false);
    expect(result.error).toContain("position metadata");
  });

  it("persists autoConvertToSol flag", async () => {
    const machine = await startClosePositionFlow(baseParams(), repository);
    const result = await machine.run();

    expect(result.success).toBe(true);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.checkpoint.checkpointData.autoConvertToSol).toBe(true);
  });

  it("updates state via trigger events", async () => {
    const machine = await startClosePositionFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    stored!.currentState = ClosePositionState.TX_CONFIRMING;
    stored!.checkpoint.currentState = ClosePositionState.TX_CONFIRMING;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      closePositionFlowDefinition,
      repository,
      stored!.id
    );

    const eventResult = await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    expect(eventResult.success).toBe(true);
    expect(eventResult.state).toBe(ClosePositionState.TX_CONFIRMED);
  });

  it("marks flow as completed via COMPLETE event", async () => {
    const machine = await startClosePositionFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    stored!.currentState = ClosePositionState.PERSISTING;
    stored!.checkpoint.currentState = ClosePositionState.PERSISTING;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      closePositionFlowDefinition,
      repository,
      stored!.id
    );

    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);
    expect(finalResult.state).toBe(ClosePositionState.COMPLETED);

    const updated = await repository.findById(stored!.id);
    expect(updated!.status).toBe("COMPLETED");
  });
});
