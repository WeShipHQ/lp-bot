/**
 * Create Position Flow Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { startCreatePositionFlow, createPositionFlowDefinition } from "../create-position-flow";
import { FlowStateMachine } from "../flow-state-machine";
import { CreatePositionState, FlowEvent } from "../flow-types";
import {
  MockFlowRepository,
  mockCreatePositionCheckpoint,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POOL_ADDRESS,
  MOCK_TOKEN_A,
  MOCK_TOKEN_B,
} from "./fixtures";

describe("Create Position Flow", () => {
  let repository: MockFlowRepository;

  beforeEach(() => {
    repository = new MockFlowRepository();
  });

  const baseParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    poolAddress: TEST_POOL_ADDRESS,
    dex: "meteora",
    tokenA: MOCK_TOKEN_A,
    tokenB: MOCK_TOKEN_B,
    tokenAAmount: "1000000000",
    tokenBAmount: "100000000",
    strategy: "spot" as const,
  });

  it("transitions from VALIDATING to BUILDING_TX on first run", async () => {
    const machine = await startCreatePositionFlow(baseParams(), repository);

    const result = await machine.run();

    expect(result.success).toBe(true);
    expect(result.state).toBe(CreatePositionState.BUILDING_TX);

    const stored = await repository.findById(result.flowId!);
    expect(stored).not.toBeNull();
    expect(stored!.currentState).toBe(CreatePositionState.BUILDING_TX);
    expect(stored!.status).toBe("PROCESSING");
    expect(stored!.checkpoint.retryCount).toBe(0);
  });

  it("persists checkpoint data on flow creation", async () => {
    const checkpoint = mockCreatePositionCheckpoint();
    const machine = await startCreatePositionFlow(
      {
        ...baseParams(),
        poolAddress: checkpoint.poolAddress,
        tokenA: checkpoint.tokenA,
        tokenB: checkpoint.tokenB,
        tokenAAmount: checkpoint.tokenAAmount,
        tokenBAmount: checkpoint.tokenBAmount,
        depositMethod: checkpoint.depositMethod,
        solAmount: checkpoint.solAmount,
      },
      repository
    );

    const result = await machine.run();
    expect(result.success).toBe(true);

    const stored = await repository.findById(result.flowId!);
    expect(stored!.checkpoint.checkpointData).toMatchObject({
      poolAddress: checkpoint.poolAddress,
      dex: checkpoint.dex,
      tokenAAmount: checkpoint.tokenAAmount,
      tokenBAmount: checkpoint.tokenBAmount,
      depositMethod: checkpoint.depositMethod,
    });
  });

  it("fails validation when required fields are missing", async () => {
    const machine = await startCreatePositionFlow(
      {
        ...baseParams(),
        poolAddress: "",
      },
      repository
    );

    const result = await machine.run();

    expect(result.success).toBe(false);
    expect(result.error).toContain("poolAddress");

    const stored = await repository.findById(result.flowId!);
    expect(stored!.checkpoint.errors.length).toBe(1);
  });

  it("enforces idempotency per user/pool intent", async () => {
    const params = baseParams();

    const machineA = await startCreatePositionFlow(params, repository);
    const resultA = await machineA.run();
    const flowA = await repository.findById(resultA.flowId!);

    const machineB = await startCreatePositionFlow(params, repository);
    await machineB.run();
    const flowB = await repository.findById(flowA!.id);

    expect(flowA!.id).toBe(flowB!.id);
  });

  it("returns existing completed flow when invoked again", async () => {
    const params = baseParams();

    const machineA = await startCreatePositionFlow(params, repository);
    const resultA = await machineA.run();
    const flowA = await repository.findById(resultA.flowId!);
    await repository.markCompleted(flowA!.id);

    const machineB = await startCreatePositionFlow(params, repository);
    const resultB = await machineB.run();

    expect(resultB.flowId).toBe(flowA!.id);
  });

  it("updates state via trigger events", async () => {
    const machine = await startCreatePositionFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    stored!.currentState = CreatePositionState.TX_SUBMITTED;
    stored!.checkpoint.currentState = CreatePositionState.TX_SUBMITTED;
    await repository.update(stored!);

    const resumedMachine = new FlowStateMachine(
      createPositionFlowDefinition,
      repository,
      stored!.id
    );

    const eventResult = await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    expect(eventResult.success).toBe(true);
    expect(eventResult.state).toBe(CreatePositionState.TX_CONFIRMED);

    const updated = await repository.findById(stored!.id);
    expect(updated!.currentState).toBe(CreatePositionState.TX_CONFIRMED);
  });

  it("returns error for unsupported events", async () => {
    const machine = await startCreatePositionFlow(baseParams(), repository);
    const result = await machine.run();
    const stored = await repository.findById(result.flowId!);

    const resumedMachine = new FlowStateMachine(
      createPositionFlowDefinition,
      repository,
      stored!.id
    );

    const eventResult = await resumedMachine.trigger(FlowEvent.SWAP_FAILED);
    expect(eventResult.success).toBe(false);
    expect(eventResult.error).toContain("No transition");
  });
});
