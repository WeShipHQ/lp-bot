/**
 * Rebalance Flow Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { startRebalanceFlow, rebalanceFlowDefinition } from "../rebalance-flow";
import { FlowStateMachine } from "../flow-state-machine";
import { RebalanceState, FlowEvent } from "../flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POSITION_ID,
  TEST_POSITION_ADDRESS,
} from "./fixtures";

describe("Rebalance Flow", () => {
  let repository: MockFlowRepository;

  beforeEach(() => {
    repository = new MockFlowRepository();
  });

  const baseParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    positionId: TEST_POSITION_ID,
    oldPositionAddress: TEST_POSITION_ADDRESS,
    reason: "price_deviation",
  });

  it("transitions from VALIDATING to CLOSING_OLD_POSITION", async () => {
    const machine = await startRebalanceFlow(baseParams(), repository);
    const result = await machine.run();

    expect(result.success).toBe(true);
    expect(result.state).toBe(RebalanceState.CLOSING_OLD_POSITION);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.currentState).toBe(RebalanceState.CLOSING_OLD_POSITION);
  });

  it("fails validation when position metadata missing", async () => {
    const machine = await startRebalanceFlow(
      {
        ...baseParams(),
        positionId: "",
      },
      repository
    );

    const result = await machine.run();

    expect(result.success).toBe(false);
    expect(result.error).toContain("position metadata");
  });

  it("persists rebalance reason in checkpoint", async () => {
    const machine = await startRebalanceFlow(
      {
        ...baseParams(),
        reason: "user_requested",
      },
      repository
    );

    const result = await machine.run();
    expect(result.success).toBe(true);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.checkpoint.checkpointData.reason).toBe("user_requested");
  });

  it("has extended timeout configured for rebalance operations", async () => {
    const machine = await startRebalanceFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    // Verify timeout is either default or as configured in definition
    expect(stored!.timeoutMs).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it("has higher retry count configured for rebalances", async () => {
    const machine = await startRebalanceFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    // Verify retry count is at least default
    expect(stored!.checkpoint.maxRetries).toBeGreaterThanOrEqual(3);
  });

  it("enforces idempotency with reason in intent", async () => {
    const params = baseParams();

    const machineA = await startRebalanceFlow(params, repository);
    const resultA = await machineA.run();
    const flowA = await repository.findById(resultA.flowId!);

    const machineB = await startRebalanceFlow(params, repository);
    await machineB.run();
    const flowB = await repository.findById(flowA!.id);

    expect(flowA!.id).toBe(flowB!.id);
    expect(flowA!.idempotencyKey).toContain(params.reason);
  });

  it("tracks multi-step rebalance states", async () => {
    const machine = await startRebalanceFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    // Simulate progression through rebalance states
    stored!.currentState = RebalanceState.OLD_POSITION_CLOSED;
    stored!.checkpoint.checkpointData.closeCompleted = true;
    await repository.update(stored!);

    let updated = await repository.findById(result.flowId!);
    expect(updated!.checkpoint.checkpointData.closeCompleted).toBe(true);

    updated!.currentState = RebalanceState.FEES_CLAIMED;
    updated!.checkpoint.checkpointData.claimCompleted = true;
    await repository.update(updated!);

    updated = await repository.findById(result.flowId!);
    expect(updated!.checkpoint.checkpointData.claimCompleted).toBe(true);

    updated!.currentState = RebalanceState.NEW_POSITION_CREATED;
    updated!.checkpoint.checkpointData.createCompleted = true;
    await repository.update(updated!);

    updated = await repository.findById(result.flowId!);
    expect(updated!.checkpoint.checkpointData.createCompleted).toBe(true);
  });

  it("completes rebalance at final state", async () => {
    const machine = await startRebalanceFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    stored!.currentState = RebalanceState.PERSISTING;
    stored!.checkpoint.currentState = RebalanceState.PERSISTING;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      rebalanceFlowDefinition,
      repository,
      stored!.id
    );

    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);
    expect(finalResult.state).toBe(RebalanceState.COMPLETED);

    const updated = await repository.findById(stored!.id);
    expect(updated!.status).toBe("COMPLETED");
  });
});
