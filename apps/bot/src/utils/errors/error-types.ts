/**
 * Comprehensive Error Types for Error Resilience Framework
 * 
 * This module defines a hierarchical error classification system that:
 * - Distinguishes retryable vs non-retryable errors
 * - Separates user-actionable from system errors
 * - Provides structured metadata for telemetry
 * - Enables smart retry policies
 */

export enum ErrorCategory {
  VALIDATION = "VALIDATION",
  AUTHORIZATION = "AUTHORIZATION",
  NOT_FOUND = "NOT_FOUND",
  BLOCKCHAIN = "BLOCKCHAIN",
  EXTERNAL_SERVICE = "EXTERNAL_SERVICE",
  INTERNAL = "INTERNAL",
  RATE_LIMIT = "RATE_LIMIT",
  TIMEOUT = "TIMEOUT",
}

export enum ErrorSeverity {
  LOW = "LOW",       // Minor issues, degraded functionality
  MEDIUM = "MEDIUM", // Significant issues, partial failure
  HIGH = "HIGH",     // Critical failures, user action blocked
  CRITICAL = "CRITICAL", // System-wide failures
}

export interface ErrorMetadata {
  correlationId?: string;
  userId?: string;
  operation?: string;
  retryCount?: number;
  timestamp?: number;
  [key: string]: any;
}

/**
 * Base class for all domain errors
 */
export abstract class ResilienceError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  abstract readonly retryable: boolean;
  abstract readonly severity: ErrorSeverity;
  
  public readonly userMessage: string;
  public readonly metadata: ErrorMetadata;
  public readonly timestamp: number;

  constructor(
    message: string,
    userMessage: string,
    metadata: ErrorMetadata = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.userMessage = userMessage;
    this.metadata = {
      ...metadata,
      timestamp: metadata.timestamp || Date.now(),
    };
    this.timestamp = this.metadata.timestamp!;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Get structured data for logging/telemetry
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      message: this.message,
      userMessage: this.userMessage,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * Check if this error should be retried based on attempt count
   */
  shouldRetry(attemptsMade: number): boolean {
    if (!this.retryable) return false;
    
    // Different max attempts based on category
    const maxAttempts = this.getMaxRetryAttempts();
    return attemptsMade < maxAttempts;
  }

  protected getMaxRetryAttempts(): number {
    switch (this.category) {
      case ErrorCategory.EXTERNAL_SERVICE:
      case ErrorCategory.BLOCKCHAIN:
        return 5;
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.RATE_LIMIT:
        return 3;
      default:
        return 0; // Non-retryable
    }
  }
}

// ============================================================================
// VALIDATION ERRORS (Non-retryable)
// ============================================================================

export class ValidationError extends ResilienceError {
  readonly code = "VALIDATION_ERROR";
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly severity = ErrorSeverity.MEDIUM;

  constructor(field: string, reason: string, metadata?: ErrorMetadata) {
    super(
      `Validation failed for ${field}: ${reason}`,
      `Invalid ${field}: ${reason}`,
      { ...metadata, field }
    );
  }
}

export class InsufficientBalanceError extends ResilienceError {
  readonly code = "INSUFFICIENT_BALANCE";
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly severity = ErrorSeverity.HIGH;

  constructor(required: string, available: string, token: string, metadata?: ErrorMetadata) {
    super(
      `Insufficient balance: need ${required} ${token}, have ${available}`,
      `Insufficient ${token} balance. You need ${required} but only have ${available}.`,
      { ...metadata, required, available, token }
    );
  }
}

export class InvalidParameterError extends ResilienceError {
  readonly code = "INVALID_PARAMETER";
  readonly category = ErrorCategory.VALIDATION;
  readonly retryable = false;
  readonly severity = ErrorSeverity.MEDIUM;

  constructor(parameterName: string, reason: string, metadata?: ErrorMetadata) {
    super(
      `Invalid parameter ${parameterName}: ${reason}`,
      `Invalid input: ${reason}`,
      { ...metadata, parameterName }
    );
  }
}

// ============================================================================
// BLOCKCHAIN ERRORS (Partially retryable)
// ============================================================================

export class BlockchainConnectionError extends ResilienceError {
  readonly code = "BLOCKCHAIN_CONNECTION_ERROR";
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable = true;
  readonly severity = ErrorSeverity.HIGH;

  constructor(endpoint: string, reason: string, metadata?: ErrorMetadata) {
    super(
      `Failed to connect to blockchain RPC ${endpoint}: ${reason}`,
      "Blockchain network is temporarily unavailable. Please try again in a moment.",
      { ...metadata, endpoint, reason }
    );
  }
}

export class TransactionSimulationError extends ResilienceError {
  readonly code = "TRANSACTION_SIMULATION_ERROR";
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable = false;
  readonly severity = ErrorSeverity.HIGH;

  constructor(reason: string, metadata?: ErrorMetadata) {
    super(
      `Transaction simulation failed: ${reason}`,
      `Transaction would fail: ${reason}. Please check your inputs and try again.`,
      { ...metadata, reason }
    );
  }
}

export class TransactionFailedError extends ResilienceError {
  readonly code = "TRANSACTION_FAILED";
  readonly category = ErrorCategory.BLOCKCHAIN;
  readonly retryable: boolean;
  readonly severity = ErrorSeverity.HIGH;

  constructor(signature: string, reason: string, isTransient: boolean = false, metadata?: ErrorMetadata) {
    const userMsg = isTransient
      ? "Transaction failed due to network congestion. Please try again."
      : `Transaction failed: ${reason}`;
    
    super(
      `Transaction ${signature} failed: ${reason}`,
      userMsg,
      { ...metadata, signature, reason, isTransient }
    );
    this.retryable = isTransient;
  }
}

export class TransactionTimeoutError extends ResilienceError {
  readonly code = "TRANSACTION_TIMEOUT";
  readonly category = ErrorCategory.TIMEOUT;
  readonly retryable = true;
  readonly severity = ErrorSeverity.HIGH;

  constructor(signature: string, timeoutMs: number, metadata?: ErrorMetadata) {
    super(
      `Transaction ${signature} timed out after ${timeoutMs}ms`,
      "Transaction is taking longer than expected. It may still confirm. Check your wallet or try again.",
      { ...metadata, signature, timeoutMs }
    );
  }
}

// ============================================================================
// EXTERNAL SERVICE ERRORS (Retryable)
// ============================================================================

export class ExternalServiceError extends ResilienceError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;

  constructor(
    serviceName: string,
    operation: string,
    reason: string,
    isTransient: boolean = true,
    metadata?: ErrorMetadata
  ) {
    const userMsg = isTransient
      ? `${serviceName} is temporarily unavailable. Please try again in a moment.`
      : `Unable to complete operation with ${serviceName}. Please contact support if this persists.`;
    
    super(
      `${serviceName} failed for operation ${operation}: ${reason}`,
      userMsg,
      { ...metadata, serviceName, operation, reason, isTransient }
    );
    this.retryable = isTransient;
    this.severity = isTransient ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH;
  }
}

export class DexAdapterError extends ExternalServiceError {
  readonly code = "DEX_ADAPTER_ERROR";

  constructor(dex: string, operation: string, reason: string, isTransient: boolean = true, metadata?: ErrorMetadata) {
    super(dex, operation, reason, isTransient, { ...metadata, dex });
  }
}

export class RpcError extends ExternalServiceError {
  readonly code = "RPC_ERROR";

  constructor(endpoint: string, operation: string, reason: string, metadata?: ErrorMetadata) {
    super("Solana RPC", operation, reason, true, { ...metadata, endpoint });
  }
}

export class JupiterApiError extends ExternalServiceError {
  readonly code = "JUPITER_API_ERROR";

  constructor(operation: string, reason: string, isTransient: boolean = true, metadata?: ErrorMetadata) {
    super("Jupiter", operation, reason, isTransient, metadata);
  }
}

export class CircuitBreakerOpenError extends ResilienceError {
  readonly code = "CIRCUIT_BREAKER_OPEN";
  readonly category = ErrorCategory.EXTERNAL_SERVICE;
  readonly retryable = false; // Don't retry when circuit is open
  readonly severity = ErrorSeverity.HIGH;

  constructor(serviceName: string, metadata?: ErrorMetadata) {
    super(
      `Circuit breaker open for ${serviceName}`,
      `${serviceName} is currently unavailable due to repeated failures. Please try again in a few minutes.`,
      { ...metadata, serviceName }
    );
  }
}

// ============================================================================
// RATE LIMIT ERRORS (Retryable with backoff)
// ============================================================================

export class RateLimitError extends ResilienceError {
  readonly code = "RATE_LIMIT_ERROR";
  readonly category = ErrorCategory.RATE_LIMIT;
  readonly retryable = true;
  readonly severity = ErrorSeverity.MEDIUM;

  constructor(service: string, retryAfterMs?: number, metadata?: ErrorMetadata) {
    const retryMsg = retryAfterMs
      ? ` Please try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
      : " Please try again in a moment.";
    
    super(
      `Rate limit exceeded for ${service}`,
      `Too many requests to ${service}.${retryMsg}`,
      { ...metadata, service, retryAfterMs }
    );
  }
}

// ============================================================================
// NOT FOUND ERRORS (Non-retryable)
// ============================================================================

export class ResourceNotFoundError extends ResilienceError {
  readonly code = "RESOURCE_NOT_FOUND";
  readonly category = ErrorCategory.NOT_FOUND;
  readonly retryable = false;
  readonly severity = ErrorSeverity.MEDIUM;

  constructor(resourceType: string, resourceId: string, metadata?: ErrorMetadata) {
    super(
      `${resourceType} ${resourceId} not found`,
      `${resourceType} not found. It may have been deleted or never existed.`,
      { ...metadata, resourceType, resourceId }
    );
  }
}

export class PositionNotFoundError extends ResourceNotFoundError {
  readonly code = "POSITION_NOT_FOUND";

  constructor(positionId: string, metadata?: ErrorMetadata) {
    super("Position", positionId, metadata);
  }
}

export class PoolNotFoundError extends ResourceNotFoundError {
  readonly code = "POOL_NOT_FOUND";

  constructor(poolAddress: string, metadata?: ErrorMetadata) {
    super("Pool", poolAddress, metadata);
  }
}

export class UserNotFoundError extends ResourceNotFoundError {
  readonly code = "USER_NOT_FOUND";

  constructor(userId: string, metadata?: ErrorMetadata) {
    super("User", userId, metadata);
  }
}

// ============================================================================
// AUTHORIZATION ERRORS (Non-retryable)
// ============================================================================

export class AuthorizationError extends ResilienceError {
  readonly code = "AUTHORIZATION_ERROR";
  readonly category = ErrorCategory.AUTHORIZATION;
  readonly retryable = false;
  readonly severity = ErrorSeverity.HIGH;

  constructor(resource: string, userId: string, metadata?: ErrorMetadata) {
    super(
      `User ${userId} unauthorized to access ${resource}`,
      "You don't have permission to perform this action.",
      { ...metadata, resource, userId }
    );
  }
}

export class WalletNotConnectedError extends ResilienceError {
  readonly code = "WALLET_NOT_CONNECTED";
  readonly category = ErrorCategory.AUTHORIZATION;
  readonly retryable = false;
  readonly severity = ErrorSeverity.HIGH;

  constructor(userId: string, metadata?: ErrorMetadata) {
    super(
      `Wallet not connected for user ${userId}`,
      "Please connect your wallet first. Use /start to set up your account.",
      { ...metadata, userId }
    );
  }
}

// ============================================================================
// INTERNAL ERRORS (Retryable as a safety net)
// ============================================================================

export class InternalError extends ResilienceError {
  readonly code = "INTERNAL_ERROR";
  readonly category = ErrorCategory.INTERNAL;
  readonly retryable = true;
  readonly severity = ErrorSeverity.CRITICAL;

  constructor(message: string, metadata?: ErrorMetadata) {
    super(
      message,
      "An unexpected error occurred. Our team has been notified. Please try again later.",
      metadata
    );
  }
}

export class ConfigurationError extends ResilienceError {
  readonly code = "CONFIGURATION_ERROR";
  readonly category = ErrorCategory.INTERNAL;
  readonly retryable = false;
  readonly severity = ErrorSeverity.CRITICAL;

  constructor(configKey: string, reason: string, metadata?: ErrorMetadata) {
    super(
      `Configuration error for ${configKey}: ${reason}`,
      "System configuration issue. Please contact support.",
      { ...metadata, configKey, reason }
    );
  }
}

// ============================================================================
// TIMEOUT ERRORS (Retryable)
// ============================================================================

export class TimeoutError extends ResilienceError {
  readonly code = "TIMEOUT_ERROR";
  readonly category = ErrorCategory.TIMEOUT;
  readonly retryable = true;
  readonly severity = ErrorSeverity.MEDIUM;

  constructor(operation: string, timeoutMs: number, metadata?: ErrorMetadata) {
    super(
      `Operation ${operation} timed out after ${timeoutMs}ms`,
      "Operation took too long. Please try again.",
      { ...metadata, operation, timeoutMs }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ResilienceError) {
    return error.retryable;
  }

  // Check for common retryable error patterns
  const message = (error as any)?.message || String(error);
  return /timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|429|5\d\d|rate limit|network|ETIMEDOUT/i.test(message);
}

/**
 * Extract error category for telemetry
 */
export function getErrorCategory(error: unknown): ErrorCategory {
  if (error instanceof ResilienceError) {
    return error.category;
  }
  return ErrorCategory.INTERNAL;
}

/**
 * Extract error code for telemetry
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof ResilienceError) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

/**
 * Get user-friendly error message
 */
export function getUserMessage(error: unknown): string {
  if (error instanceof ResilienceError) {
    return error.userMessage;
  }
  
  if (error instanceof Error) {
    return `An error occurred: ${error.message}`;
  }
  
  return "An unexpected error occurred. Please try again.";
}
