/**
 * Error Telemetry and Metrics Collection
 * 
 * Utilities for tracking error rates, patterns, and performance metrics.
 */

import { logger } from "@/utils/logger";
import {
  ResilienceError,
  extractErrorMetrics,
  extractErrorTelemetry,
  ErrorCategory,
  ErrorSeverity,
} from "./error-types";
import type { ErrorMetrics } from "./error-metadata";

// In-memory metrics store (could be replaced with a proper metrics service)
class ErrorMetricsStore {
  private errorCounts: Map<string, number> = new Map();
  private errorsByCategory: Map<ErrorCategory, number> = new Map();
  private errorsBySeverity: Map<ErrorSeverity, number> = new Map();
  private errorsByOperation: Map<string, number> = new Map();
  private retryCounts: Map<string, number> = new Map();

  recordError(metrics: ErrorMetrics): void {
    // Count by error code
    const codeKey = `error:${metrics.errorCode}`;
    this.errorCounts.set(codeKey, (this.errorCounts.get(codeKey) || 0) + 1);

    // Count by category
    this.errorsByCategory.set(
      metrics.errorCategory as ErrorCategory,
      (this.errorsByCategory.get(metrics.errorCategory as ErrorCategory) || 0) + 1
    );

    // Count by severity
    this.errorsBySeverity.set(
      metrics.severity as ErrorSeverity,
      (this.errorsBySeverity.get(metrics.severity as ErrorSeverity) || 0) + 1
    );

    // Count by operation
    if (metrics.operation) {
      const opKey = `operation:${metrics.operation}`;
      this.errorsByOperation.set(opKey, (this.errorsByOperation.get(opKey) || 0) + 1);
    }

    // Count retries
    if (metrics.retryable) {
      const retryKey = `retry:${metrics.errorCode}`;
      this.retryCounts.set(retryKey, (this.retryCounts.get(retryKey) || 0) + 1);
    }
  }

  getStats() {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      errorsByCode: Object.fromEntries(this.errorCounts),
      errorsByCategory: Object.fromEntries(this.errorsByCategory),
      errorsBySeverity: Object.fromEntries(this.errorsBySeverity),
      errorsByOperation: Object.fromEntries(this.errorsByOperation),
      retryCounts: Object.fromEntries(this.retryCounts),
    };
  }

  reset(): void {
    this.errorCounts.clear();
    this.errorsByCategory.clear();
    this.errorsBySeverity.clear();
    this.errorsByOperation.clear();
    this.retryCounts.clear();
  }
}

export const errorMetricsStore = new ErrorMetricsStore();

/**
 * Track an error occurrence with telemetry
 */
export function trackError(
  error: unknown,
  operation: string,
  userId?: string,
  additionalContext?: Record<string, any>
): void {
  try {
    const metrics = extractErrorMetrics(error, operation, userId);
    errorMetricsStore.recordError(metrics);

    const telemetry = extractErrorTelemetry(error, additionalContext);

    // Log with structured data
    const logLevel =
      telemetry.severity === ErrorSeverity.CRITICAL || telemetry.severity === ErrorSeverity.HIGH
        ? "error"
        : telemetry.severity === ErrorSeverity.MEDIUM
        ? "warn"
        : "info";

    logger[logLevel](
      {
        ...telemetry,
        operation,
        userId,
        ...additionalContext,
      },
      `[ErrorTelemetry] ${operation} failed: ${telemetry.errorCode}`
    );
  } catch (err) {
    logger.error(
      {
        error: err,
        originalError: (error as any)?.message,
      },
      "[ErrorTelemetry] Failed to track error"
    );
  }
}

/**
 * Track a successful operation (for calculating success rates)
 */
export function trackSuccess(operation: string, userId?: string, durationMs?: number): void {
  try {
    logger.info(
      {
        operation,
        userId,
        durationMs,
        success: true,
      },
      `[SuccessTelemetry] ${operation} succeeded`
    );
  } catch (err) {
    logger.error(
      {
        error: err,
      },
      "[SuccessTelemetry] Failed to track success"
    );
  }
}

/**
 * Track a retry attempt
 */
export function trackRetry(
  error: unknown,
  operation: string,
  attemptNumber: number,
  userId?: string
): void {
  try {
    const telemetry = extractErrorTelemetry(error);

    logger.warn(
      {
        operation,
        userId,
        errorCode: telemetry.errorCode,
        errorCategory: telemetry.errorCategory,
        attemptNumber,
        retryable: telemetry.retryable,
      },
      `[RetryTelemetry] Retry attempt ${attemptNumber} for ${operation}`
    );
  } catch (err) {
    logger.error(
      {
        error: err,
      },
      "[RetryTelemetry] Failed to track retry"
    );
  }
}

/**
 * Track circuit breaker state change
 */
export function trackCircuitBreakerStateChange(
  serviceName: string,
  oldState: string,
  newState: string,
  failureCount?: number
): void {
  try {
    logger.warn(
      {
        serviceName,
        oldState,
        newState,
        failureCount,
      },
      `[CircuitBreaker] ${serviceName} circuit breaker state changed: ${oldState} -> ${newState}`
    );
  } catch (err) {
    logger.error(
      {
        error: err,
      },
      "[CircuitBreaker] Failed to track state change"
    );
  }
}

/**
 * Get current error metrics
 */
export function getErrorMetrics() {
  return errorMetricsStore.getStats();
}

/**
 * Reset error metrics (useful for testing or periodic reset)
 */
export function resetErrorMetrics(): void {
  errorMetricsStore.reset();
}

/**
 * Calculate error rate for an operation
 */
export function calculateErrorRate(
  operation: string,
  successCount: number,
  errorCount: number
): number {
  const total = successCount + errorCount;
  if (total === 0) return 0;
  return (errorCount / total) * 100;
}

/**
 * Check if error rate is above threshold
 */
export function isErrorRateHigh(errorRate: number, threshold: number = 10): boolean {
  return errorRate > threshold;
}

/**
 * Structured logging helper for errors with context
 */
export interface StructuredErrorLog {
  error: unknown;
  operation: string;
  userId?: string;
  correlationId?: string;
  additionalContext?: Record<string, any>;
}

export function logStructuredError(log: StructuredErrorLog): void {
  const telemetry = extractErrorTelemetry(log.error, {
    operation: log.operation,
    userId: log.userId,
    correlationId: log.correlationId,
    ...log.additionalContext,
  });

  const logLevel =
    telemetry.severity === ErrorSeverity.CRITICAL || telemetry.severity === ErrorSeverity.HIGH
      ? "error"
      : telemetry.severity === ErrorSeverity.MEDIUM
      ? "warn"
      : "info";

  logger[logLevel](
    {
      ...telemetry,
      correlationId: log.correlationId,
      ...log.additionalContext,
    },
    `[${log.operation}] ${telemetry.errorMessage}`
  );

  // Also track the error
  trackError(log.error, log.operation, log.userId, log.additionalContext);
}

/**
 * Alert on critical errors (can be extended to send to monitoring services)
 */
export function alertOnCriticalError(
  error: unknown,
  operation: string,
  context?: Record<string, any>
): void {
  if (error instanceof ResilienceError && error.severity === ErrorSeverity.CRITICAL) {
    logger.error(
      {
        severity: "CRITICAL",
        operation,
        errorCode: error.code,
        errorCategory: error.category,
        ...context,
      },
      `[CRITICAL ALERT] ${operation} failed with critical error: ${error.message}`
    );

    // TODO: Send to alerting service (PagerDuty, Slack, etc.)
    // Example: await sendSlackAlert({ error, operation, context });
  }
}
