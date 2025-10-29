/**
 * Flow State Machine Core Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { FlowStateMachine, FlowRepository, FlowService } from "../flow-state-machine";
import { FlowType, FlowEvent, CreatePositionState } from "../flow-types";
import {
  MockFlowRepository,
  TEST_USER_ID,
  TEST_WALLET_ADDRESS,
  TEST_WALLET_ID,
  TEST_POOL_ADDRESS,
  MOCK_TOKEN_A,
  MOCK_TOKEN_B,
} from "./fixtures";
import { createPositionFlowDefinition } from "../create-position-flow";

describe("FlowStateMachine - Core Functionality", () => {
  let repository: MockFlowRepository;

  beforeEach(() => {
    repository = new MockFlowRepository();
  });

  describe("Flow Initialization", () => {
    it("creates new flow with initial state", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
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
      expect(result.flowId).toBeDefined();

      const flow = await repository.findById(result.flowId!);
      expect(flow).not.toBeNull();
      expect(flow!.userId).toBe(TEST_USER_ID);
      expect(flow!.walletAddress).toBe(TEST_WALLET_ADDRESS);
      expect(flow!.flowType).toBe(FlowType.CREATE_POSITION);
    });

    it("generates unique flow IDs for different flows", async () => {
      const machine1 = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
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

      const machine2 = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        {
          userId: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS,
          walletId: TEST_WALLET_ID,
          flowType: FlowType.CREATE_POSITION,
          intent: "different-pool",
          metadata: {
            initialState: CreatePositionState.VALIDATING,
            checkpointData: {
              poolAddress: "different-pool",
              dex: "meteora",
              tokenA: MOCK_TOKEN_A,
              tokenB: MOCK_TOKEN_B,
              tokenAAmount: "1000000000",
              tokenBAmount: "100000000",
            },
          },
        }
      );

      const result1 = await machine1.run();
      const result2 = await machine2.run();

      expect(result1.flowId).not.toBe(result2.flowId);
    });

    it("resumes existing flow with same idempotency key", async () => {
      const createParams = {
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
      };

      const machine1 = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        createParams
      );
      const result1 = await machine1.run();

      const machine2 = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        createParams
      );
      const result2 = await machine2.run();

      expect(result1.flowId).toBeDefined();
      expect(result2.flowId).toBeDefined();
    });
  });

  describe("State Transitions", () => {
    it("progresses through states on successful step execution", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
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

      expect(result.success).toBe(true);
      expect(result.state).toBe(CreatePositionState.BUILDING_TX);
    });

    it("maintains checkpoint data across transitions", async () => {
      const checkpointData = {
        poolAddress: TEST_POOL_ADDRESS,
        dex: "meteora",
        tokenA: MOCK_TOKEN_A,
        tokenB: MOCK_TOKEN_B,
        tokenAAmount: "1000000000",
        tokenBAmount: "100000000",
      };

      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        {
          userId: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS,
          walletId: TEST_WALLET_ID,
          flowType: FlowType.CREATE_POSITION,
          intent: TEST_POOL_ADDRESS,
          metadata: {
            initialState: CreatePositionState.VALIDATING,
            checkpointData,
          },
        }
      );

      const result = await machine.run();
      const flow = await repository.findById(result.flowId!);

      expect(flow!.checkpoint.checkpointData).toMatchObject(checkpointData);
    });

    it("handles event-driven state transitions", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
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

      const triggerResult = await machine.trigger(FlowEvent.TX_CONFIRMED);
      expect(triggerResult.success).toBe(true);
      expect(triggerResult.state).toBe(CreatePositionState.TX_CONFIRMED);
    });
  });

  describe("Error Handling", () => {
    it("records errors in checkpoint on step failure", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        {
          userId: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS,
          walletId: TEST_WALLET_ID,
          flowType: FlowType.CREATE_POSITION,
          intent: TEST_POOL_ADDRESS,
          metadata: {
            initialState: CreatePositionState.VALIDATING,
            checkpointData: {
              poolAddress: "", // Invalid
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
      expect(result.success).toBe(false);

      const flow = await repository.findById(result.flowId!);
      expect(flow!.checkpoint.errors.length).toBeGreaterThan(0);
      expect(flow!.checkpoint.lastError).toBeDefined();
    });

    it("increments retry count on failure", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        {
          userId: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS,
          walletId: TEST_WALLET_ID,
          flowType: FlowType.CREATE_POSITION,
          intent: TEST_POOL_ADDRESS,
          metadata: {
            initialState: CreatePositionState.VALIDATING,
            checkpointData: {
              poolAddress: "",
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
      const flow = await repository.findById(result.flowId!);

      expect(flow!.checkpoint.retryCount).toBe(1);
    });

    it("marks flow as FAILED after max retries", async () => {
      const machine = await FlowStateMachine.start(
        createPositionFlowDefinition,
        repository as any,
        {
          userId: TEST_USER_ID,
          walletAddress: TEST_WALLET_ADDRESS,
          walletId: TEST_WALLET_ID,
          flowType: FlowType.CREATE_POSITION,
          intent: TEST_POOL_ADDRESS,
          maxRetries: 1,
          metadata: {
            initialState: CreatePositionState.VALIDATING,
            checkpointData: {
              poolAddress: "",
              dex: "meteora",
              tokenA: MOCK_TOKEN_A,
              tokenB: MOCK_TOKEN_B,
              tokenAAmount: "1000000000",
              tokenBAmount: "100000000",
            },
          },
        }
      );

      // First attempt
      await machine.run();

      // Second attempt (exceeds maxRetries=1)
      await machine.run();

      const flow = await repository.findById((await machine.run()).flowId!);
      expect(flow!.status).toBe("FAILED");
    });
  });

  describe("FlowService", () => {
    it("starts flow via service", async () => {
      const service = new FlowService(repository as any);
      const machine = await service.startFlow(createPositionFlowDefinition, {
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
      });

      const result = await machine.run();
      expect(result.flowId).toBeDefined();
    });

    it("resumes flow via service", async () => {
      const service = new FlowService(repository as any);
      const machine = await service.startFlow(createPositionFlowDefinition, {
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
      });

      const result = await machine.run();
      const flowId = result.flowId!;

      const resumedMachine = await service.resumeFlow(
        createPositionFlowDefinition,
        flowId
      );

      expect(resumedMachine).toBeDefined();
    });

    it("marks flow as completed via service", async () => {
      const service = new FlowService(repository as any);
      const machine = await service.startFlow(createPositionFlowDefinition, {
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
      });

      const result = await machine.run();
      await service.markCompleted(result.flowId!);

      const flow = await repository.findById(result.flowId!);
      expect(flow!.status).toBe("COMPLETED");
    });
  });
});
