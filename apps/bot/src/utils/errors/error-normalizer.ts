/**
 * Error Normalizer
 * 
 * Converts any error into a ResilienceError with proper classification.
 */

import { ApplicationError, BadRequestError, ForbiddenError, NotFoundError, RateLimitError as LegacyRateLimitError, UnauthorizedError } from "@/shared/errors/application-error";
import { BlockchainError, DatabaseError, ExternalApiError, InfrastructureError, TransactionError } from "@/shared/errors/infrastructure-error";
import { DomainError, InsufficientBalanceError as DomainInsufficientBalanceError, InvalidAmountError as DomainInvalidAmountError, InvalidStateError as DomainInvalidStateError, ValidationError as DomainValidationError } from "@/domain/shared/errors/domain-error";
import {
  ResilienceError,
  InternalError,
  ValidationError,
  InsufficientBalanceError,
  InvalidParameterError,
  ExternalServiceError,
  DexAdapterError,
  RpcError,
  TransactionFailedError,
  TransactionSimulationError,
  BlockchainConnectionError,
  TransactionTimeoutError,
  RateLimitError,
  ResourceNotFoundError,
  AuthorizationError,
  TimeoutError,
  ErrorMetadata,
} from "./error-types";

type MaybeError = ResilienceError | Error | unknown;

/**
 * Convert any error to a ResilienceError with optional metadata enrichment.
 */
export function normalizeError(error: MaybeError, metadata: ErrorMetadata = {}): ResilienceError {
  if (error instanceof ResilienceError) {
    Object.assign(error.metadata, metadata);
    return error;
  }

  if (error instanceof ValidationError) {
    // Already normalized by old system
    return error;
  }

  // Map application-level errors
  if (error instanceof BadRequestError || error instanceof DomainValidationError) {
    return new ValidationError("request", error.message, metadata);
  }

  if (error instanceof DomainInvalidAmountError) {
    return new ValidationError("amount", error.message, metadata);
  }

  if (error instanceof DomainInvalidStateError) {
    return new InternalError(`Invalid state: ${error.message}`, metadata);
  }

  if (error instanceof NotFoundError) {
    return new ResourceNotFoundError("Resource", error.message, metadata);
  }

  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return new AuthorizationError("resource", metadata.userId || "unknown", metadata);
  }

  if (error instanceof LegacyRateLimitError) {
    return new RateLimitError("service", undefined, metadata);
  }

  // Domain-specific errors
  if (error instanceof DomainInsufficientBalanceError) {
    const { required, available, token } = extractBalanceDetails(error.message);
    return new InsufficientBalanceError(required, available, token, metadata);
  }

  // Infrastructure errors
  if (error instanceof ExternalApiError) {
    return new ExternalServiceError(error.apiName || "External API", metadata.operation || "unknown", error.message, true, metadata);
  }

  if (error instanceof BlockchainError) {
    return new BlockchainConnectionError(metadata.endpoint || "Solana", error.message, metadata);
  }

  if (error instanceof TransactionError) {
    return new TransactionFailedError(error.signature || metadata.signature || "unknown", error.message, false, metadata);
  }

  if (error instanceof InfrastructureError) {
    return new InternalError(error.message, metadata);
  }

  if (error instanceof DatabaseError) {
    return new InternalError(`Database error: ${error.message}`, metadata);
  }

  if (error instanceof ApplicationError) {
    return new InternalError(`Application error: ${error.message}`, metadata);
  }

  if (error instanceof DomainError) {
    return new InternalError(`Domain error: ${error.message}`, metadata);
  }

  // Handle specific error patterns based on message content
  const message = (error as any)?.message || String(error);

  if (/timeout/i.test(message)) {
    return new TimeoutError(metadata.operation || "operation", metadata.timeoutMs || 30000, metadata);
  }

  if (/rate limit/i.test(message)) {
    return new RateLimitError(metadata.service || "service", metadata.retryAfterMs, metadata);
  }

  if (/simulation/i.test(message)) {
    return new TransactionSimulationError(message, metadata);
  }

  if (/transaction/i.test(message) && metadata.signature) {
    return new TransactionFailedError(metadata.signature, message, false, metadata);
  }

  // Default to internal error
  return new InternalError(message || "Unknown error", metadata);
}

/**
 * Extract balance details from an error message
 */
function extractBalanceDetails(message: string): { required: string; available: string; token: string } {
  const match = message.match(/need\s+(\d+(?:\.\d+)?)\s+(\w+)/i);
  if (match) {
    const [, required, token] = match;
    const availableMatch = message.match(/have\s+(\d+(?:\.\d+)?)\s+\w+/i);
    const available = availableMatch ? availableMatch[1] : "0";
    return { required, available, token };
  }

  return { required: "unknown", available: "unknown", token: "token" };
}

/**
 * Helper to normalize errors with context
 */
export function withErrorContext(error: MaybeError, context: ErrorMetadata): ResilienceError {
  const normalized = normalizeError(error, context);
  return normalized;
}

/**
 * Normalize adapter errors
 */
export function normalizeAdapterError(
  error: MaybeError,
  dex: string,
  operation: string,
  metadata: ErrorMetadata = {}
): ResilienceError {
  if (error instanceof ResilienceError) {
    Object.assign(error.metadata, { dex, operation, ...metadata });
    return error;
  }

  // Wrap in DexAdapterError
  const message = (error as Error)?.message || String(error);
  return new DexAdapterError(dex, operation, message, true, {
    ...metadata,
    originalError: message,
  });
}

/**
 * Normalize RPC errors
 */
export function normalizeRpcError(
  error: MaybeError,
  endpoint: string,
  operation: string,
  metadata: ErrorMetadata = {}
): ResilienceError {
  if (error instanceof ResilienceError) {
    Object.assign(error.metadata, { endpoint, operation, ...metadata });
    return error;
  }

  const message = (error as Error)?.message || String(error);
  return new RpcError(endpoint, operation, message, {
    ...metadata,
    originalError: message,
  });
}

/**
 * Normalize transaction errors
 */
export function normalizeTransactionError(
  error: MaybeError,
  signature: string,
  metadata: ErrorMetadata = {}
): ResilienceError {
  if (error instanceof ResilienceError) {
    Object.assign(error.metadata, { signature, ...metadata });
    return error;
  }

  const message = (error as Error)?.message || String(error);
  if (/timeout/i.test(message)) {
    return new TransactionTimeoutError(signature, metadata.timeoutMs || 30000, {
      ...metadata,
      originalError: message,
    });
  }

  if (/simulation/i.test(message)) {
    return new TransactionSimulationError(message, {
      ...metadata,
      signature,
      originalError: message,
    });
  }

  return new TransactionFailedError(signature, message, false, {
    ...metadata,
    originalError: message,
  });
}
