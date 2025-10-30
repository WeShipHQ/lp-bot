/**
 * Position Domain Errors (ADR-001 Implementation)
 * 
 * Comprehensive error classification for position lifecycle operations
 * with user-friendly messages, retry logic, and error categories.
 */

import { DomainError } from "@/domain/shared/errors/domain-error";

export enum ErrorCategory {
  VALIDATION = "VALIDATION",
  AUTHORIZATION = "AUTHORIZATION",
  NOT_FOUND = "NOT_FOUND",
  BLOCKCHAIN = "BLOCKCHAIN",
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE",
  INTERNAL = "INTERNAL",
}

/**
 * Base class for position-related errors with enhanced metadata
 */
export abstract class PositionError extends DomainError {
  abstract readonly category: ErrorCategory;
  abstract readonly retryable: boolean;
  abstract readonly userMessage: string;
  
  constructor(
    message: string,
    code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message, code);
    this.name = this.constructor.name;
  }
}

/**
 * Insufficient balance error - non-retryable
 */
export class InsufficientBalancePositionError extends PositionError {
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(required: number, available: number, token: string) {
    super(
      `Insufficient balance: need ${required} ${token}, have ${available}`,
      "INSUFFICIENT_BALANCE",
      { required, available, token }
    );
    this.userMessage = `Insufficient ${token} balance. You need ${required} but only have ${available}.`;
  }
}

/**
 * Transaction failed error - may be retryable depending on cause
 */
export class TransactionFailedError extends PositionError {
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable: boolean;
  readonly userMessage: string;
  
  constructor(signature: string, reason: string, isTransient: boolean = false) {
    super(
      `Transaction ${signature} failed: ${reason}`,
      "TRANSACTION_FAILED",
      { signature, reason }
    );
    this.retryable = isTransient;
    this.userMessage = isTransient
      ? "Transaction failed due to network congestion. Please try again."
      : `Transaction failed: ${reason}`;
  }
}

/**
 * RPC error - retryable
 */
export class RpcError extends PositionError {
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable = true;
  readonly userMessage = "Blockchain network is temporarily unavailable. Please try again.";
  
  constructor(endpoint: string, originalError: Error) {
    super(
      `RPC call to ${endpoint} failed`,
      "RPC_ERROR",
      { endpoint, originalError: originalError.message }
    );
  }
}

/**
 * Position not found error - non-retryable
 */
export class PositionNotFoundError extends PositionError {
  readonly category = ErrorCategory.NOT_FOUND;
  readonly retryable = false;
  readonly userMessage = "Position not found. It may have been closed or never existed.";
  
  constructor(positionId: string) {
    super(`Position ${positionId} not found`, "POSITION_NOT_FOUND", { positionId });
  }
}

/**
 * Adapter error - retryability depends on context
 */
export class AdapterError extends PositionError {
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable: boolean;
  readonly userMessage: string;
  
  constructor(dex: string, operation: string, originalError: Error, isTransient: boolean = true) {
    super(
      `${dex} adapter failed for ${operation}`,
      "ADAPTER_ERROR",
      { dex, operation, originalError: originalError.message }
    );
    this.retryable = isTransient;
    this.userMessage = isTransient
      ? `${dex} is temporarily unavailable. Please try again.`
      : `Unable to complete operation on ${dex}. Please contact support.`;
  }
}

/**
 * Transaction simulation failed - non-retryable
 */
export class TransactionSimulationError extends PositionError {
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(reason: string, context?: Record<string, any>) {
    super(
      `Transaction simulation failed: ${reason}`,
      "SIMULATION_FAILED",
      context
    );
    this.userMessage = `Unable to simulate transaction: ${reason}. Please check your inputs.`;
  }
}

/**
 * Slippage tolerance exceeded - non-retryable (user must adjust)
 */
export class SlippageExceededError extends PositionError {
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(expected: number, actual: number, tolerance: number) {
    super(
      `Slippage exceeded: expected ${expected}, got ${actual}, tolerance ${tolerance}%`,
      "SLIPPAGE_EXCEEDED",
      { expected, actual, tolerance }
    );
    this.userMessage = `Price moved too much (${Math.abs(((actual - expected) / expected) * 100).toFixed(2)}%). Please try again or increase slippage tolerance.`;
  }
}

/**
 * Invalid amount error - non-retryable
 */
export class InvalidPositionAmountError extends PositionError {
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(amount: number, min: number, max?: number) {
    const message = max
      ? `Amount ${amount} must be between ${min} and ${max}`
      : `Amount ${amount} must be at least ${min}`;
    super(message, "INVALID_AMOUNT", { amount, min, max });
    this.userMessage = max
      ? `Amount must be between ${min} and ${max}`
      : `Minimum amount is ${min}`;
  }
}

/**
 * Position limit exceeded - non-retryable
 */
export class PositionLimitExceededError extends PositionError {
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(current: number, limit: number) {
    super(
      `Position limit exceeded: ${current}/${limit}`,
      "POSITION_LIMIT_EXCEEDED",
      { current, limit }
    );
    this.userMessage = `Maximum ${limit} positions allowed. Please close an existing position first.`;
  }
}

/**
 * Invalid pool error - non-retryable
 */
export class InvalidPoolError extends PositionError {
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly userMessage = "Invalid pool address or pool does not exist.";
  
  constructor(poolAddress: string, dex: string) {
    super(
      `Invalid pool ${poolAddress} on ${dex}`,
      "INVALID_POOL",
      { poolAddress, dex }
    );
  }
}

/**
 * Wallet signature rejected - non-retryable
 */
export class SignatureRejectedError extends PositionError {
  readonly category = ErrorCategory.AUTHORIZATION;
  readonly retryable = false;
  readonly userMessage = "Transaction signature was rejected. No funds were transferred.";
  
  constructor(walletAddress: string) {
    super(
      `User rejected transaction signature`,
      "SIGNATURE_REJECTED",
      { walletAddress }
    );
  }
}

/**
 * Internal error - retryable
 */
export class InternalPositionError extends PositionError {
  readonly category = ErrorCategory.INTERNAL;
  readonly retryable = true;
  readonly userMessage = "An unexpected error occurred. Our team has been notified. Please try again later.";
  
  constructor(message: string, context?: Record<string, any>) {
    super(message, "INTERNAL_ERROR", context);
  }
}

/**
 * Database persistence error - retryable
 */
export class PositionPersistenceError extends PositionError {
  readonly category = ErrorCategory.INTERNAL;
  readonly retryable = true;
  readonly userMessage = "Failed to save position data. Please try again.";
  
  constructor(operation: string, originalError: Error) {
    super(
      `Database operation "${operation}" failed`,
      "PERSISTENCE_ERROR",
      { operation, originalError: originalError.message }
    );
  }
}

/**
 * Strategy validation error - non-retryable
 */
export class StrategyValidationError extends PositionError {
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly userMessage: string;
  
  constructor(strategy: string, reason: string) {
    super(
      `Strategy validation failed for "${strategy}": ${reason}`,
      "STRATEGY_VALIDATION_ERROR",
      { strategy, reason }
    );
    this.userMessage = `Strategy configuration error: ${reason}`;
  }
}

/**
 * Helper to determine if an error should be retried
 */
export function shouldRetryError(error: unknown, attemptsMade: number): boolean {
  if (!(error instanceof PositionError)) {
    // Unknown errors: retry up to 3 times
    return attemptsMade < 3;
  }
  
  if (!error.retryable) {
    // Non-retryable errors: don't retry
    return false;
  }
  
  // Retryable errors: use exponential backoff
  const maxAttempts = error.category === ErrorCategory.EXTERNAL_SERVICE ? 5 : 3;
  return attemptsMade < maxAttempts;
}

/**
 * Helper to calculate backoff delay for retries (exponential)
 */
export function calculateBackoff(attemptNumber: number): number {
  return Math.min(2000 * Math.pow(2, attemptNumber), 30000); // Max 30 seconds
}
