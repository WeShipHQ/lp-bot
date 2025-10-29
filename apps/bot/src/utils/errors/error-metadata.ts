/**
 * Error Metadata and Telemetry Utilities
 * 
 * Provides tools for:
 * - Generating correlation IDs for request tracing
 * - Enriching errors with telemetry data
 * - Tracking retry attempts
 * - Extracting structured error data for logging and metrics
 */

import { randomUUID } from "crypto";
import { ResilienceError, ErrorCategory, ErrorSeverity, getErrorCategory, getErrorCode } from "./error-types";
import type { ErrorMetadata } from "./error-types";

/**
 * Generate a correlation ID for tracing requests across services
 */
export function generateCorrelationId(): string {
  return `cor_${randomUUID()}`;
}

/**
 * Enrich error with additional context and telemetry metadata
 */
export function enrichError<T extends Error>(
  error: T,
  context: ErrorMetadata
): T {
  if (error instanceof ResilienceError) {
    // Merge existing metadata with new context
    Object.assign(error.metadata, context);
  } else {
    // Attach metadata to regular errors
    Object.assign(error, { metadata: context });
  }
  return error;
}

/**
 * Extract telemetry data from an error for logging/metrics
 */
export interface ErrorTelemetry {
  errorName: string;
  errorCode: string;
  errorCategory: ErrorCategory;
  errorMessage: string;
  userMessage: string;
  retryable: boolean;
  severity: ErrorSeverity;
  timestamp: number;
  correlationId?: string;
  userId?: string;
  operation?: string;
  retryCount?: number;
  metadata?: Record<string, any>;
  stack?: string;
}

export function extractErrorTelemetry(error: unknown, additionalContext?: ErrorMetadata): ErrorTelemetry {
  if (error instanceof ResilienceError) {
    return {
      errorName: error.name,
      errorCode: error.code,
      errorCategory: error.category,
      errorMessage: error.message,
      userMessage: error.userMessage,
      retryable: error.retryable,
      severity: error.severity,
      timestamp: error.timestamp,
      correlationId: error.metadata.correlationId,
      userId: error.metadata.userId,
      operation: error.metadata.operation,
      retryCount: error.metadata.retryCount,
      metadata: { ...error.metadata, ...additionalContext },
      stack: error.stack,
    };
  }

  // Handle regular errors
  const regularError = error as Error;
  return {
    errorName: regularError?.name || "Error",
    errorCode: getErrorCode(error),
    errorCategory: getErrorCategory(error),
    errorMessage: regularError?.message || String(error),
    userMessage: regularError?.message || "An unexpected error occurred",
    retryable: false,
    severity: ErrorSeverity.MEDIUM,
    timestamp: Date.now(),
    metadata: additionalContext,
    stack: regularError?.stack,
  };
}

/**
 * Track retry attempts in error metadata
 */
export function incrementRetryCount(error: ResilienceError): void {
  const currentCount = error.metadata.retryCount || 0;
  error.metadata.retryCount = currentCount + 1;
}

/**
 * Check if error should be retried based on metadata
 */
export function shouldRetryWithMetadata(
  error: unknown,
  maxAttempts: number = 3
): boolean {
  if (error instanceof ResilienceError) {
    const attemptsMade = error.metadata.retryCount || 0;
    return error.shouldRetry(attemptsMade);
  }

  // For non-ResilienceError, use basic retry logic
  const attemptsMade = (error as any)?.metadata?.retryCount || 0;
  return attemptsMade < maxAttempts;
}

/**
 * Format error for database storage
 */
export interface StoredErrorData {
  errorCode: string;
  errorMessage: string;
  errorCategory: string;
  retryable: boolean;
  retryCount: number;
  timestamp: number;
  metadata: Record<string, any>;
}

export function serializeErrorForStorage(error: unknown): StoredErrorData {
  const telemetry = extractErrorTelemetry(error);
  
  return {
    errorCode: telemetry.errorCode,
    errorMessage: telemetry.errorMessage,
    errorCategory: telemetry.errorCategory,
    retryable: telemetry.retryable,
    retryCount: telemetry.retryCount || 0,
    timestamp: telemetry.timestamp,
    metadata: telemetry.metadata || {},
  };
}

/**
 * Create error context for a specific operation
 */
export interface OperationContext {
  operation: string;
  userId?: string;
  positionId?: string;
  signature?: string;
  dex?: string;
  correlationId?: string;
}

export function createOperationContext(
  operation: string,
  additionalContext?: Partial<OperationContext>
): ErrorMetadata {
  return {
    operation,
    correlationId: generateCorrelationId(),
    timestamp: Date.now(),
    ...additionalContext,
  };
}

/**
 * Extract retry delay from error (for rate limits)
 */
export function getRetryDelay(error: unknown): number | undefined {
  if (error instanceof ResilienceError) {
    return error.metadata.retryAfterMs as number | undefined;
  }
  return undefined;
}

/**
 * Check if error is a permanent failure (should not retry)
 */
export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof ResilienceError) {
    return !error.retryable;
  }

  // Check for common permanent failure patterns
  const message = (error as any)?.message || String(error);
  return /invalid|unauthorized|forbidden|not found|bad request|validation|insufficient/i.test(message);
}

/**
 * Create a summary of error for notifications
 */
export interface ErrorSummary {
  title: string;
  problem: string;
  nextSteps: string[];
  technicalDetails?: string;
  canRetry: boolean;
}

export function createErrorSummary(error: unknown, operation: string): ErrorSummary {
  if (error instanceof ResilienceError) {
    const nextSteps = generateNextSteps(error);
    
    return {
      title: `${operation} Failed`,
      problem: error.userMessage,
      nextSteps,
      technicalDetails: error.code,
      canRetry: error.retryable,
    };
  }

  const errorMessage = (error as Error)?.message || String(error);
  
  return {
    title: `${operation} Failed`,
    problem: errorMessage,
    nextSteps: ["Please try again", "Contact support if this persists"],
    canRetry: !isPermanentFailure(error),
  };
}

/**
 * Generate user-actionable next steps based on error type
 */
function generateNextSteps(error: ResilienceError): string[] {
  switch (error.category) {
    case ErrorCategory.VALIDATION:
      return [
        "Check your inputs and try again",
        "Ensure all required fields are filled correctly",
      ];
    
    case ErrorCategory.AUTHORIZATION:
      return [
        "Make sure you're connected with the correct wallet",
        "Use /start to reconnect your wallet",
      ];
    
    case ErrorCategory.NOT_FOUND:
      return [
        "Verify the resource exists",
        "Refresh your portfolio with /portfolio",
      ];
    
    case ErrorCategory.BLOCKCHAIN:
      if (error.retryable) {
        return [
          "Wait a moment and try again",
          "The network may be congested",
          "Check Solana status: https://status.solana.com",
        ];
      }
      return [
        "Review your transaction details",
        "Ensure you have enough SOL for gas fees",
        "Contact support if needed",
      ];
    
    case ErrorCategory.EXTERNAL_SERVICE:
      return [
        "The service is temporarily unavailable",
        "Please try again in a few minutes",
        "Check our status page for updates",
      ];
    
    case ErrorCategory.RATE_LIMIT:
      return [
        "Please slow down and wait a moment",
        `Try again in ${Math.ceil((error.metadata.retryAfterMs || 30000) / 1000)} seconds`,
      ];
    
    case ErrorCategory.TIMEOUT:
      return [
        "The operation took too long",
        "Check your network connection",
        "Try again with a stable connection",
      ];
    
    case ErrorCategory.INTERNAL:
      return [
        "Our team has been notified",
        "Please try again later",
        "Contact support if this continues",
      ];
    
    default:
      return ["Please try again", "Contact support if this persists"];
  }
}

/**
 * Format error for Telegram notification
 */
export function formatErrorForNotification(
  error: unknown,
  operation: string,
  includeTechnicalDetails: boolean = false
): string {
  const summary = createErrorSummary(error, operation);
  
  let message = `❌ *${summary.title}*\n\n`;
  message += `${summary.problem}\n\n`;
  
  if (summary.nextSteps.length > 0) {
    message += "*What to do next:*\n";
    summary.nextSteps.forEach((step, i) => {
      message += `${i + 1}. ${step}\n`;
    });
    message += "\n";
  }
  
  if (summary.canRetry) {
    message += "✅ You can try this operation again.\n\n";
  }
  
  if (includeTechnicalDetails && summary.technicalDetails) {
    message += `_Error Code: ${summary.technicalDetails}_`;
  }
  
  return message;
}

/**
 * Metrics helper: Extract error labels for metrics collection
 */
export interface ErrorMetrics {
  errorCode: string;
  errorCategory: string;
  operation: string;
  retryable: boolean;
  severity: string;
  userId?: string;
}

export function extractErrorMetrics(
  error: unknown,
  operation: string,
  userId?: string
): ErrorMetrics {
  const telemetry = extractErrorTelemetry(error);
  
  return {
    errorCode: telemetry.errorCode,
    errorCategory: telemetry.errorCategory,
    operation: operation || telemetry.operation || "unknown",
    retryable: telemetry.retryable,
    severity: telemetry.severity,
    userId: userId || telemetry.userId,
  };
}
