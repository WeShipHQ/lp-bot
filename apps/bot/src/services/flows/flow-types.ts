/**
 * Flow State Machine Types
 * 
 * Defines the states, events, and types for all transaction flows.
 * Each flow (CREATE, CLAIM, CLOSE, REBALANCE) has explicit states
 * that enable resumable/restartable operations.
 */

// Flow Types
export enum FlowType {
  CREATE_POSITION = "CREATE_POSITION",
  CLAIM_FEES = "CLAIM_FEES",
  CLOSE_POSITION = "CLOSE_POSITION",
  REBALANCE = "REBALANCE",
  SOL_TO_TOKEN_SWAP = "SOL_TO_TOKEN_SWAP",
}

// ==================== CREATE POSITION FLOW ====================
export enum CreatePositionState {
  INITIATED = "INITIATED",
  VALIDATING = "VALIDATING",
  SWAP_PENDING = "SWAP_PENDING",
  SWAP_CONFIRMED = "SWAP_CONFIRMED",
  BUILDING_TX = "BUILDING_TX",
  TX_SUBMITTED = "TX_SUBMITTED",
  TX_CONFIRMING = "TX_CONFIRMING",
  TX_CONFIRMED = "TX_CONFIRMED",
  PERSISTING = "PERSISTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  COMPENSATING = "COMPENSATING",
}

// ==================== CLAIM FEES FLOW ====================
export enum ClaimFeesState {
  INITIATED = "INITIATED",
  VALIDATING = "VALIDATING",
  BUILDING_TX = "BUILDING_TX",
  TX_SUBMITTED = "TX_SUBMITTED",
  TX_CONFIRMING = "TX_CONFIRMING",
  TX_CONFIRMED = "TX_CONFIRMED",
  SWAP_PENDING = "SWAP_PENDING", // If auto-convert to SOL enabled
  SWAP_CONFIRMED = "SWAP_CONFIRMED",
  PERSISTING = "PERSISTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  COMPENSATING = "COMPENSATING",
}

// ==================== CLOSE POSITION FLOW ====================
export enum ClosePositionState {
  INITIATED = "INITIATED",
  VALIDATING = "VALIDATING",
  BUILDING_TX = "BUILDING_TX",
  TX_SUBMITTED = "TX_SUBMITTED",
  TX_CONFIRMING = "TX_CONFIRMING",
  TX_CONFIRMED = "TX_CONFIRMED",
  SWAP_PENDING = "SWAP_PENDING", // If auto-convert to SOL enabled
  SWAP_CONFIRMED = "SWAP_CONFIRMED",
  PERSISTING = "PERSISTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  COMPENSATING = "COMPENSATING",
}

// ==================== REBALANCE FLOW ====================
export enum RebalanceState {
  INITIATED = "INITIATED",
  VALIDATING = "VALIDATING",
  CLOSING_OLD_POSITION = "CLOSING_OLD_POSITION",
  OLD_POSITION_CLOSED = "OLD_POSITION_CLOSED",
  CLAIMING_FEES = "CLAIMING_FEES",
  FEES_CLAIMED = "FEES_CLAIMED",
  CREATING_NEW_POSITION = "CREATING_NEW_POSITION",
  NEW_POSITION_CREATED = "NEW_POSITION_CREATED",
  PERSISTING = "PERSISTING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  COMPENSATING = "COMPENSATING",
}

// Union type of all states
export type FlowState =
  | CreatePositionState
  | ClaimFeesState
  | ClosePositionState
  | RebalanceState;

// ==================== FLOW EVENTS ====================
export enum FlowEvent {
  VALIDATE = "VALIDATE",
  VALIDATION_SUCCESS = "VALIDATION_SUCCESS",
  VALIDATION_FAILED = "VALIDATION_FAILED",
  BUILD_TX = "BUILD_TX",
  TX_BUILT = "TX_BUILT",
  SUBMIT_TX = "SUBMIT_TX",
  TX_SUBMITTED = "TX_SUBMITTED",
  CONFIRM_TX = "CONFIRM_TX",
  TX_CONFIRMED = "TX_CONFIRMED",
  TX_FAILED = "TX_FAILED",
  SWAP_INITIATED = "SWAP_INITIATED",
  SWAP_COMPLETED = "SWAP_COMPLETED",
  SWAP_FAILED = "SWAP_FAILED",
  PERSIST = "PERSIST",
  PERSIST_SUCCESS = "PERSIST_SUCCESS",
  PERSIST_FAILED = "PERSIST_FAILED",
  COMPLETE = "COMPLETE",
  FAIL = "FAIL",
  COMPENSATE = "COMPENSATE",
  COMPENSATED = "COMPENSATED",
  RETRY = "RETRY",
}

// ==================== FLOW CONTEXT ====================
export interface FlowContext<T = any> {
  flowId: string;
  flowType: FlowType;
  currentState: FlowState;
  userId: string;
  walletAddress: string;
  walletId?: string;
  idempotencyKey: string;
  
  // Timestamps
  startedAt: Date;
  lastTransitionAt: Date;
  completedAt?: Date;
  
  // Retry tracking
  retryCount: number;
  maxRetries: number;
  
  // Transaction tracking
  signatures: string[];
  currentSignature?: string;
  
  // Checkpoint data for recovery
  checkpointData: T;
  
  // Error tracking
  errors: FlowError[];
  lastError?: FlowError;
}

export interface FlowError {
  state: FlowState;
  event: FlowEvent;
  error: string;
  errorCode?: string;
  timestamp: Date;
  retryable: boolean;
}

// ==================== CHECKPOINT DATA TYPES ====================
export interface CreatePositionCheckpoint {
  poolAddress: string;
  dex: string;
  tokenA: any;
  tokenB: any;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  solAmount?: number;
  
  // Swap tracking (for sol_auto_convert)
  swapGroup?: string;
  swap1Signature?: string;
  swap2Signature?: string;
  swap1Completed?: boolean;
  swap2Completed?: boolean;
  
  // Position creation
  positionAddress?: string;
  positionKeypair?: string; // Serialized keypair
  
  // Rebalance context
  rebalanceSession?: any;
}

export interface ClaimFeesCheckpoint {
  positionId: string;
  positionAddress: string;
  autoConvertToSol: boolean;
  
  // Claimed amounts
  claimedTokenAAmount?: string;
  claimedTokenBAmount?: string;
  
  // Swap tracking (if autoConvertToSol)
  swapGroup?: string;
  swap1Signature?: string;
  swap2Signature?: string;
  swap1Completed?: boolean;
  swap2Completed?: boolean;
}

export interface ClosePositionCheckpoint {
  positionId: string;
  positionAddress: string;
  autoConvertToSol: boolean;
  
  // Final amounts
  finalTokenAAmount?: string;
  finalTokenBAmount?: string;
  claimedFeesTokenA?: string;
  claimedFeesTokenB?: string;
  
  // Swap tracking (if autoConvertToSol)
  swapGroup?: string;
  swap1Signature?: string;
  swap2Signature?: string;
  swap1Completed?: boolean;
  swap2Completed?: boolean;
}

export interface RebalanceCheckpoint {
  positionId: string;
  oldPositionAddress: string;
  reason: string;
  
  // Close phase
  closeSignature?: string;
  closeCompleted?: boolean;
  
  // Claim phase
  claimSignature?: string;
  claimCompleted?: boolean;
  claimedFeesTokenA?: string;
  claimedFeesTokenB?: string;
  
  // Create phase
  newPositionAddress?: string;
  createSignature?: string;
  createCompleted?: boolean;
  
  // Session data
  sessionId?: string;
  oldSegmentId?: string;
  newSegmentId?: string;
}

// ==================== STATE TRANSITIONS ====================
export interface StateTransition {
  from: FlowState;
  to: FlowState;
  event: FlowEvent;
  guard?: (context: FlowContext) => boolean;
  action?: (context: FlowContext) => Promise<void>;
}

// ==================== IDEMPOTENCY ====================
export interface IdempotencyKeyParams {
  userId: string;
  flowType: FlowType;
  intent: string; // Unique identifier for the operation (e.g., poolAddress for CREATE, positionId for CLAIM/CLOSE)
}

export function generateIdempotencyKey(params: IdempotencyKeyParams): string {
  const { userId, flowType, intent } = params;
  return `${flowType}:${userId}:${intent}`;
}

// ==================== FLOW RESULT ====================
export interface FlowStep {
  name: string;
  state: FlowState;
  handler?: (context: FlowContext<any>) => Promise<FlowResult>;
  compensation?: (context: FlowContext<any>) => Promise<FlowResult>;
  asyncWait?: boolean;
  on?: Partial<Record<FlowEvent, FlowState>>;
}

export interface FlowDefinition {
  flowType: FlowType;
  maxRetries?: number;
  timeoutMs?: number;
  steps: FlowStep[];
  transitions?: Record<FlowState, Partial<Record<FlowEvent, FlowState>>>;
  initialContext?: Record<string, any>;
}

export interface FlowResult<T = any> {
  success: boolean;
  flowId?: string;
  state?: FlowState;
  signature?: string;
  error?: string;
  data?: T;
}
