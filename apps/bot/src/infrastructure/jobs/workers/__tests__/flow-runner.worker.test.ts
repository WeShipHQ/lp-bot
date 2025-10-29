/**
 * Flow Runner Worker Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { FlowRunnerWorker } from "../flow-runner.worker";
import { FlowType, CreatePositionState, ClaimFeesState } from "@/services/flows/flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POOL_ADDRESS,
  MOCK_TOKEN_A,
  MOCK_TOKEN_B,
} from "@/services/flows/__tests__/fixtures";
import { FlowStateMachine } from "@/services/flows/flow-state-machine";
import { createPositionFlowDefinition } from "@/services/flows/create-position-flow";

describe("FlowRunnerWorker", () => {
  let repository: MockFlowRepository;
  let worker: FlowRunnerWorker;

  beforeEach(() => {
    repository = new MockFlowRepository();
    worker = new FlowRunnerWorker();
    // @ts-ignore - access private property for testing
    worker.repository = repository;
  });

  it("processes CREATE_POSITION flow successfully", async () => {
    const machine = await FlowStateMachine.start(
      createPositionFlowDefinition,
      repository,
      {
        userId: TEST_USER_ID,
        walletAddress: TEST_WALLET_ADDRESS,
        walletId: TEST_WALLET_ID,
        flowType: FlowType.CREATE_POSITION,
        intent: TEST_POOL_ADDRESS,
        metadata: {
          initialState: CreatePositionState.VALIDATING,
          checkpointData: {
            poolAddress: TEST_POOL_ADDRESS,
            dex: "meteora",
            tokenA: MOCK_TOKEN_A,
            tokenB: MOCK_TOKEN_B,
            tokenAAmount: "1000000000",
            tokenBAmount: "100000000",
          },
        },
      }
    );

    const job = {
      data: {
        flowId: (await machine.run()).flowId!,
        flowType: FlowType.CREATE_POSITION,
      },
    } as any;

    const result = await worker.process(job);

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
  });

  it("returns error for unknown flow type", async () => {
    const job = {
      data: {
        flowId: "unknown-flow",
        flowType: "UNKNOWN_TYPE" as any,
      },
    } as any;

    const result = await worker.process(job);

    expect(result.success).toBe(false);
    expect(result.reason).toBe("no_definition");
  });

  it("processes flow and returns current state", async () => {
    const machine = await FlowStateMachine.start(
      createPositionFlowDefinition,
      repository,
      {
        userId: TEST_USER_ID,
        walletAddress: TEST_WALLET_ADDRESS,
        walletId: TEST_WALLET_ID,
        flowType: FlowType.CREATE_POSITION,
        intent: TEST_POOL_ADDRESS,
        metadata: {
          initialState: CreatePositionState.VALIDATING,
          checkpointData: {
            poolAddress: TEST_POOL_ADDRESS,
            dex: "meteora",
            tokenA: MOCK_TOKEN_A,
            tokenB: MOCK_TOKEN_B,
            tokenAAmount: "1000000000",
            tokenBAmount: "100000000",
          },
        },
      }
    );

    const result = await machine.run();
    const flowId = result.flowId!;

    // Process the flow through worker
    const job = {
      data: {
        flowId,
        flowType: FlowType.CREATE_POSITION,
      },
    } as any;

    const workerResult = await worker.process(job);

    // Worker should successfully process
    expect(workerResult.success).toBe(true);
    expect(workerResult.state).toBeDefined();
  });

  it("handles flow step failure gracefully", async () => {
    const machine = await FlowStateMachine.start(
      createPositionFlowDefinition,
      repository,
      {
        userId: TEST_USER_ID,
        walletAddress: TEST_WALLET_ADDRESS,
        walletId: TEST_WALLET_ID,
        flowType: FlowType.CREATE_POSITION,
        intent: TEST_POOL_ADDRESS,
        metadata: {
          initialState: CreatePositionState.VALIDATING,
          checkpointData: {
            poolAddress: "", // Invalid - should fail validation
            dex: "meteora",
            tokenA: MOCK_TOKEN_A,
            tokenB: MOCK_TOKEN_B,
            tokenAAmount: "1000000000",
            tokenBAmount: "100000000",
          },
        },
      }
    );

    const result = await machine.run();
    const job = {
      data: {
        flowId: result.flowId!,
        flowType: FlowType.CREATE_POSITION,
      },
    } as any;

    const workerResult = await worker.process(job);

    expect(workerResult.success).toBe(false);
    expect(workerResult.error).toBeDefined();
  });

  it("recognizes COMPLETED state and returns success", async () => {
    const machine = await FlowStateMachine.start(
      createPositionFlowDefinition,
      repository,
      {
        userId: TEST_USER_ID,
        walletAddress: TEST_WALLET_ADDRESS,
        walletId: TEST_WALLET_ID,
        flowType: FlowType.CREATE_POSITION,
        intent: TEST_POOL_ADDRESS,
        metadata: {
          initialState: CreatePositionState.VALIDATING,
          checkpointData: {
            poolAddress: TEST_POOL_ADDRESS,
            dex: "meteora",
            tokenA: MOCK_TOKEN_A,
            tokenB: MOCK_TOKEN_B,
            tokenAAmount: "1000000000",
            tokenBAmount: "100000000",
          },
        },
      }
    );

    const result = await machine.run();
    const flowId = result.flowId!;

    // Mark as completed
    await repository.markCompleted(flowId);

    const job = {
      data: {
        flowId,
        flowType: FlowType.CREATE_POSITION,
      },
    } as any;

    const workerResult = await worker.process(job);

    expect(workerResult.success).toBe(true);
  });
});
