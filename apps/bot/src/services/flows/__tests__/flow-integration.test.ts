/**
 * Flow Integration Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FlowStateMachine } from "../flow-state-machine";
import {
  startCreatePositionFlow,
  createPositionFlowDefinition,
} from "../create-position-flow";
import {
  startClaimFeesFlow,
  claimFeesFlowDefinition,
} from "../claim-fees-flow";
import {
  startClosePositionFlow,
  closePositionFlowDefinition,
} from "../close-position-flow";
import {
  startRebalanceFlow,
  rebalanceFlowDefinition,
} from "../rebalance-flow";
import {
  FlowEvent,
  CreatePositionState,
  ClaimFeesState,
  ClosePositionState,
  RebalanceState,
  FlowType,
} from "../flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POOL_ADDRESS,
  TEST_POSITION_ID,
  TEST_POSITION_ADDRESS,
  MOCK_TOKEN_A,
  MOCK_TOKEN_B,
} from "./fixtures";

describe("Flow Integration", () => {
  let repository: MockFlowRepository;

  beforeEach(() => {
    repository = new MockFlowRepository();
  });

  const createFlowParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    poolAddress: TEST_POOL_ADDRESS,
    dex: "meteora",
    tokenA: MOCK_TOKEN_A,
    tokenB: MOCK_TOKEN_B,
    tokenAAmount: "1000000000",
    tokenBAmount: "100000000",
  });

  const claimFlowParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    positionId: TEST_POSITION_ID,
    positionAddress: TEST_POSITION_ADDRESS,
    autoConvertToSol: false,
  });

  const closeFlowParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    positionId: TEST_POSITION_ID,
    positionAddress: TEST_POSITION_ADDRESS,
    autoConvertToSol: true,
  });

  const rebalanceFlowParams = () => ({
    userId: TEST_USER_ID,
    walletAddress: TEST_WALLET_ADDRESS,
    walletId: TEST_WALLET_ID,
    positionId: TEST_POSITION_ID,
    oldPositionAddress: TEST_POSITION_ADDRESS,
    reason: "price_deviation",
  });

  it("runs create position flow through validation and completion", async () => {
    const machine = await startCreatePositionFlow(createFlowParams(), repository);
    const result = await machine.run();

    expect(result.state).toBe(CreatePositionState.BUILDING_TX);

    const flow = await repository.findById(result.flowId!);
    expect(flow!.currentState).toBe(CreatePositionState.BUILDING_TX);

    const resumedMachine = new FlowStateMachine(
      createPositionFlowDefinition,
      repository,
      flow!.id
    );

    // Move through awaiting -> confirmation -> completion
    await resumedMachine.trigger(FlowEvent.TX_SUBMITTED);
    await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);

    expect(finalResult.state).toBe(CreatePositionState.COMPLETED);
    const completedFlow = await repository.findById(flow!.id);
    expect(completedFlow!.status).toBe("COMPLETED");
  });

  it("runs claim fees flow through validation and completion", async () => {
    const machine = await startClaimFeesFlow(claimFlowParams(), repository);
    const result = await machine.run();

    expect(result.state).toBe(ClaimFeesState.BUILDING_TX);

    const flow = await repository.findById(result.flowId!);
    const resumedMachine = new FlowStateMachine(
      claimFeesFlowDefinition,
      repository,
      flow!.id
    );

    await resumedMachine.trigger(FlowEvent.TX_SUBMITTED);
    await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);

    expect(finalResult.state).toBe(ClaimFeesState.COMPLETED);
  });

  it("runs close position flow through validation and completion", async () => {
    const machine = await startClosePositionFlow(closeFlowParams(), repository);
    const result = await machine.run();

    expect(result.state).toBe(ClosePositionState.BUILDING_TX);

    const flow = await repository.findById(result.flowId!);
    const resumedMachine = new FlowStateMachine(
      closePositionFlowDefinition,
      repository,
      flow!.id
    );

    await resumedMachine.trigger(FlowEvent.TX_SUBMITTED);
    await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);

    expect(finalResult.state).toBe(ClosePositionState.COMPLETED);
  });

  it("runs rebalance flow through validation and completion", async () => {
    const machine = await startRebalanceFlow(rebalanceFlowParams(), repository);
    const result = await machine.run();

    expect(result.state).toBe(RebalanceState.CLOSING_OLD_POSITION);

    const flow = await repository.findById(result.flowId!);
    const resumedMachine = new FlowStateMachine(
      rebalanceFlowDefinition,
      repository,
      flow!.id
    );

    await resumedMachine.trigger(FlowEvent.TX_SUBMITTED);
    await resumedMachine.trigger(FlowEvent.TX_CONFIRMED);
    const finalResult = await resumedMachine.trigger(FlowEvent.COMPLETE);

    expect(finalResult.state).toBe(RebalanceState.COMPLETED);
  });

  it("enforces idempotency per flow intent", async () => {
    const machineA = await startCreatePositionFlow(createFlowParams(), repository);
    const resultA = await machineA.run();

    const machineB = await startCreatePositionFlow(createFlowParams(), repository);
    const resultB = await machineB.run();

    expect(resultA.flowId).toBe(resultB.flowId);
  });

  it("allows concurrent flows with different intents", async () => {
    const machineA = await startCreatePositionFlow(
      { ...createFlowParams(), poolAddress: "pool-1" },
      repository
    );
    const machineB = await startCreatePositionFlow(
      { ...createFlowParams(), poolAddress: "pool-2" },
      repository
    );

    const [resultA, resultB] = await Promise.all([machineA.run(), machineB.run()]);

    expect(resultA.flowId).not.toBe(resultB.flowId);
  });

  it("records errors and increments retry count on validation failure", async () => {
    const machine = await startCreatePositionFlow(
      { ...createFlowParams(), poolAddress: "" },
      repository
    );

    const result = await machine.run();
    expect(result.success).toBe(false);

    const flow = await repository.findById(result.flowId!);
    expect(flow!.checkpoint.retryCount).toBeGreaterThan(0);
    expect(flow!.checkpoint.errors.length).toBeGreaterThan(0);
  });

  it("supports retry and eventual completion", async () => {
    const machine = await startCreatePositionFlow(createFlowParams(), repository);
    let result = await machine.run();

    const flow = await repository.findById(result.flowId!);
    flow!.checkpoint.retryCount = 1;
    flow!.checkpoint.lastError = {
      state: flow!.currentState,
      event: FlowEvent.FAIL,
      error: "temporary",
      timestamp: new Date().toISOString(),
      retryable: true,
    };
    await repository.update(flow!);

    const resumedMachine = new FlowStateMachine(
      createPositionFlowDefinition,
      repository,
      flow!.id
    );

    result = await resumedMachine.run();
    expect(result.success).toBe(true);
  });
});
