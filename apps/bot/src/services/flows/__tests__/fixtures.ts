/**
 * Test Fixtures for Flow State Machine Tests
 * 
 * Provides reusable test data, mocks, and utilities for testing flows.
 */

import { vi } from "vitest";
import { 
  FlowType, 
  CreatePositionState,
  ClaimFeesState,
  ClosePositionState,
  RebalanceState,
  CreatePositionCheckpoint,
  ClaimFeesCheckpoint,
  ClosePositionCheckpoint,
  RebalanceCheckpoint,
  FlowContext,
} from '../flow-types';
import { FlowRepository } from "../flow-state-machine";

// ==================== TEST CONSTANTS ====================

export const TEST_USER_ID = 'test-user-123';
export const TEST_WALLET_ADDRESS = 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK';
export const TEST_WALLET_ID = 'wallet-456';
export const TEST_POOL_ADDRESS = 'BnYJ9pAFd7aWqoYEE6SjjHzXbLhBfxNPCRX6Bh1pZQZZ';
export const TEST_POSITION_ADDRESS = 'CnYJ9pAFd7aWqoYEE6SjjHzXbLhBfxNPCRX6Bh1pZQZZ';
export const TEST_POSITION_ID = 'position-789';
export const TEST_SIGNATURE = '5a9b8d7c6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d';

// ==================== MOCK TOKENS ====================

export const MOCK_TOKEN_A = {
  address: 'So11111111111111111111111111111111111111112',
  symbol: 'SOL',
  decimals: 9,
  name: 'Wrapped SOL',
};

export const MOCK_TOKEN_B = {
  address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  symbol: 'USDC',
  decimals: 6,
  name: 'USD Coin',
};

// ==================== FLOW CHECKPOINTS ====================

export const mockCreatePositionCheckpoint = (): CreatePositionCheckpoint => ({
  poolAddress: TEST_POOL_ADDRESS,
  dex: 'meteora',
  tokenA: MOCK_TOKEN_A,
  tokenB: MOCK_TOKEN_B,
  tokenAAmount: '1000000000', // 1 SOL
  tokenBAmount: '100000000', // 100 USDC
  strategy: 'spot',
  depositMethod: 'sol_auto_convert',
  solAmount: 1.0,
});

export const mockClaimFeesCheckpoint = (): ClaimFeesCheckpoint => ({
  positionId: TEST_POSITION_ID,
  positionAddress: TEST_POSITION_ADDRESS,
  autoConvertToSol: false,
});

export const mockClosePositionCheckpoint = (): ClosePositionCheckpoint => ({
  positionId: TEST_POSITION_ID,
  positionAddress: TEST_POSITION_ADDRESS,
  autoConvertToSol: true,
});

export const mockRebalanceCheckpoint = (): RebalanceCheckpoint => ({
  positionId: TEST_POSITION_ID,
  oldPositionAddress: TEST_POSITION_ADDRESS,
  reason: 'price_deviation',
});

// ==================== FLOW CONTEXTS ====================

export const mockFlowContext = <T>(
  overrides: Partial<FlowContext<T>> = {}
): FlowContext<T> => ({
  flowId: 'flow-123',
  flowType: FlowType.CREATE_POSITION,
  currentState: CreatePositionState.VALIDATING,
  userId: TEST_USER_ID,
  walletAddress: TEST_WALLET_ADDRESS,
  walletId: TEST_WALLET_ID,
  idempotencyKey: 'CREATE_POSITION:test-user-123:pool-address',
  startedAt: new Date(),
  lastTransitionAt: new Date(),
  retryCount: 0,
  maxRetries: 3,
  signatures: [],
  checkpointData: {} as T,
  errors: [],
  ...overrides,
});

// ==================== MOCK ERRORS ====================

export class MockRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class MockNonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

export class MockRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

export class MockInsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

// ==================== MOCK REPOSITORY ====================

export class MockFlowRepository extends FlowRepository {
  private flows = new Map<string, any>();
  private idempotencyMap = new Map<string, string>(); // idempotencyKey -> flowId
  private counter = 0;

  constructor() {
    super();
  }

  override async findById(flowId: string) {
    return this.flows.get(flowId) || null;
  }

  override async findByIdempotencyKey(idempotencyKey: string) {
    const flowId = this.idempotencyMap.get(idempotencyKey);
    if (!flowId) return null;
    return this.flows.get(flowId) || null;
  }

  override async create(params: any) {
    const flowId = params.metadata?.flowId || `flow-${Date.now()}-${++this.counter}`;
    const idempotencyKey = `${params.flowType}:${params.userId}:${params.intent}`;
    
    const flow = {
      id: flowId,
      flowType: params.flowType,
      signature: params.metadata?.signature || 'pending',
      userId: params.userId,
      walletAddress: params.walletAddress,
      walletId: params.walletId,
      idempotencyKey,
      currentState: params.metadata?.initialState || 'INITIATED',
      status: 'PENDING',
      checkpoint: {
        currentState: params.metadata?.initialState || 'INITIATED',
        timestamps: {
          startedAt: new Date().toISOString(),
          lastTransitionAt: new Date().toISOString(),
        },
        retryCount: 0,
        maxRetries: params.maxRetries ?? 3,
        signatures: [],
        checkpointData: params.metadata?.checkpointData || {},
        errors: [],
      },
      metadata: params.metadata || {},
      timeoutMs: params.timeoutMs ?? 10 * 60 * 1000,
      flowStartedAt: new Date().toISOString(),
      flowLastTransitionAt: new Date().toISOString(),
      flowExpiresAt: new Date(Date.now() + (params.timeoutMs ?? 10 * 60 * 1000)).toISOString(),
    };

    this.flows.set(flowId, flow);
    this.idempotencyMap.set(idempotencyKey, flowId);

    return flow;
  }

  async update(flow: any) {
    this.flows.set(flow.id, { ...flow });
  }

  async markCompleted(flowId: string) {
    const flow = this.flows.get(flowId);
    if (flow) {
      flow.currentState = 'COMPLETED';
      flow.status = 'COMPLETED';
      flow.checkpoint.timestamps.completedAt = new Date().toISOString();
    }
  }

  async markFailed(flowId: string, error: string) {
    const flow = this.flows.get(flowId);
    if (flow) {
      flow.currentState = 'FAILED';
      flow.status = 'FAILED';
      flow.checkpoint.lastError = {
        state: flow.currentState,
        event: 'FAIL',
        error,
        timestamp: new Date().toISOString(),
        retryable: false,
      };
    }
  }

  async markCompensating(flowId: string) {
    const flow = this.flows.get(flowId);
    if (flow) {
      flow.currentState = 'COMPENSATING';
      flow.status = 'COMPENSATING';
    }
  }

  // Test helper methods
  clear() {
    this.flows.clear();
    this.idempotencyMap.clear();
  }

  getAll() {
    return Array.from(this.flows.values());
  }

  setFlow(flowId: string, flow: any) {
    this.flows.set(flowId, flow);
  }
}

// ==================== MOCK ADAPTERS ====================

export interface MockAdapterCallLog {
  method: string;
  args: any[];
  timestamp: Date;
}

export class MockMeteoraAdapter {
  public callLog: MockAdapterCallLog[] = [];
  public shouldFail: boolean = false;
  public failureError: Error | null = null;

  async createPosition(params: any) {
    this.callLog.push({ method: 'createPosition', args: [params], timestamp: new Date() });
    
    if (this.shouldFail) {
      throw this.failureError || new Error('Mock adapter failure');
    }

    return {
      signature: TEST_SIGNATURE,
      positionAddress: TEST_POSITION_ADDRESS,
    };
  }

  async claimFees(params: any) {
    this.callLog.push({ method: 'claimFees', args: [params], timestamp: new Date() });
    
    if (this.shouldFail) {
      throw this.failureError || new Error('Mock adapter failure');
    }

    return {
      signature: TEST_SIGNATURE,
      claimedTokenA: '100000000',
      claimedTokenB: '50000000',
    };
  }

  async closePosition(params: any) {
    this.callLog.push({ method: 'closePosition', args: [params], timestamp: new Date() });
    
    if (this.shouldFail) {
      throw this.failureError || new Error('Mock adapter failure');
    }

    return {
      signature: TEST_SIGNATURE,
      finalTokenA: '1000000000',
      finalTokenB: '100000000',
    };
  }

  reset() {
    this.callLog = [];
    this.shouldFail = false;
    this.failureError = null;
  }
}

export class MockJupiterAdapter {
  public callLog: MockAdapterCallLog[] = [];
  public shouldFail: boolean = false;

  async executeSwap(params: any) {
    this.callLog.push({ method: 'executeSwap', args: [params], timestamp: new Date() });
    
    if (this.shouldFail) {
      throw new Error('Mock Jupiter swap failure');
    }

    return {
      signature: TEST_SIGNATURE,
      outputAmount: params.expectedAmount || '1000000000',
    };
  }

  reset() {
    this.callLog = [];
    this.shouldFail = false;
  }
}

// ==================== MOCK RPC ====================

export class MockSolanaRpc {
  public callLog: MockAdapterCallLog[] = [];
  public shouldFail: boolean = false;
  public confirmationDelay: number = 0; // ms

  async confirmTransaction(signature: string) {
    this.callLog.push({ method: 'confirmTransaction', args: [signature], timestamp: new Date() });
    
    if (this.confirmationDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.confirmationDelay));
    }

    if (this.shouldFail) {
      throw new Error('Mock RPC confirmation failure');
    }

    return {
      value: { err: null },
      context: { slot: 123456 },
    };
  }

  async getTransaction(signature: string) {
    this.callLog.push({ method: 'getTransaction', args: [signature], timestamp: new Date() });
    
    if (this.shouldFail) {
      return null;
    }

    return {
      meta: { err: null },
      slot: 123456,
    };
  }

  reset() {
    this.callLog = [];
    this.shouldFail = false;
    this.confirmationDelay = 0;
  }
}

// ==================== TEST UTILITIES ====================

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createMockDatabase() {
  const records = new Map<string, any>();
  
  return {
    insert: vi.fn((table) => ({
      values: vi.fn((data) => {
        const id = data.id || `record-${Date.now()}`;
        records.set(id, { ...data, id });
        return Promise.resolve([{ ...data, id }]);
      }),
    })),
    update: vi.fn((table) => ({
      set: vi.fn((data) => ({
        where: vi.fn(() => {
          return Promise.resolve();
        }),
      })),
    })),
    query: {
      pendingTransactions: {
        findFirst: vi.fn(({ where }) => {
          const record = Array.from(records.values()).find(() => true);
          return Promise.resolve(record);
        }),
      },
    },
    // Test helpers
    _records: records,
    _clear: () => records.clear(),
  };
}

export function assertFlowTransitioned(
  flow: any,
  expectedState: string,
  expectedStatus?: string
) {
  expect(flow.currentState).toBe(expectedState);
  if (expectedStatus) {
    expect(flow.status).toBe(expectedStatus);
  }
  expect(flow.checkpoint.currentState).toBe(expectedState);
}

export function assertErrorRecorded(
  flow: any,
  errorMessage?: string
) {
  expect(flow.checkpoint.errors.length).toBeGreaterThan(0);
  expect(flow.checkpoint.lastError).toBeDefined();
  if (errorMessage) {
    expect(flow.checkpoint.lastError.error).toContain(errorMessage);
  }
}

export function assertSignatureRecorded(
  flow: any,
  signature: string
) {
  expect(flow.signature).toBe(signature);
  expect(flow.checkpoint.signatures).toContain(signature);
  expect(flow.checkpoint.currentSignature).toBe(signature);
}
