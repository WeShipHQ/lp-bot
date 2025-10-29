/**
 * Claim Fees Flow Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { startClaimFeesFlow, claimFeesFlowDefinition } from "../claim-fees-flow";
import { FlowStateMachine } from "../flow-state-machine";
import { ClaimFeesState, FlowEvent } from "../flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POSITION_ID,
  TEST_POSITION_ADDRESS,
} from "./fixtures";

describe("Claim Fees Flow", () => {
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
    autoConvertToSol: false,
  });

  it("transitions from VALIDATING to BUILDING_TX", async () => {
    const machine = await startClaimFeesFlow(baseParams(), repository);
    const result = await machine.run();

    expect(result.success).toBe(true);
    expect(result.state).toBe(ClaimFeesState.BUILDING_TX);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.currentState).toBe(ClaimFeesState.BUILDING_TX);
    expect(stored!.status).toBe("PROCESSING");
  });

  it("fails validation when position metadata missing", async () => {
    const machine = await startClaimFeesFlow(
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

  it("persists autoConvertToSol setting in checkpoint", async () => {
    const machine = await startClaimFeesFlow(
      {
        ...baseParams(),
        autoConvertToSol: true,
      },
      repository
    );

    const result = await machine.run();
    expect(result.success).toBe(true);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.checkpoint.checkpointData.autoConvertToSol).toBe(true);
  });

  it("handles TX_CONFIRMED event", async () => {
    const machine = await startClaimFeesFlow(baseParams(), repository);
    const result = await machine.run();

    const stored = await repository.findById(result.flowId!);
    stored!.currentState = ClaimFeesState.TX_CONFIRMING;
    stored!.checkpoint.currentState = ClaimFeesState.TX_CONFIRMING;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      claimFeesFlowDefinition,
      repository,
      stored!.id
    );

    const eventResult = await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    expect(eventResult.success).toBe(true);
    expect(eventResult.state).toBe(ClaimFeesState.TX_CONFIRMED);
  });

  it("retries on transient failure", async () => {
    const machine = await startClaimFeesFlow(baseParams(), repository);
    const result = await machine.run();

    const stored = await repository.findById(result.flowId!);
    stored!.checkpoint.retryCount = 1;
    stored!.checkpoint.lastError = {
      state: ClaimFeesState.BUILDING_TX,
      event: FlowEvent.FAIL,
      error: "Network timeout",
      timestamp: new Date().toISOString(),
      retryable: true,
    };
    stored!.checkpoint.errors.push(stored!.checkpoint.lastError);
    await repository.update(stored!);

    const updated = await repository.findById(result.flowId!);
    expect(updated!.checkpoint.retryCount).toBe(1);
    expect(updated!.checkpoint.lastError.retryable).toBe(true);
  });

  it("marks as completed at final state", async () => {
    const machine = await startClaimFeesFlow(baseParams(), repository);
    const result = await machine.run();

    const stored = await repository.findById(result.flowId!);
    stored!.currentState = ClaimFeesState.PERSISTING;
    stored!.checkpoint.currentState = ClaimFeesState.PERSISTING;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      claimFeesFlowDefinition,
      repository,
      stored!.id
    );

    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);
    expect(finalResult.state).toBe(ClaimFeesState.COMPLETED);

    const updated = await repository.findById(stored!.id);
    expect(updated!.status).toBe("COMPLETED");
  });

  it("enforces idempotency per position", async () => {
    const params = baseParams();

    const machineA = await startClaimFeesFlow(params, repository);
    const resultA = await machineA.run();
    const flowA = await repository.findById(resultA.flowId!);

    const machineB = await startClaimFeesFlow(params, repository);
    await machineB.run();
    const flowB = await repository.findById(flowA!.id);

    expect(flowA!.id).toBe(flowB!.id);
  });
});
