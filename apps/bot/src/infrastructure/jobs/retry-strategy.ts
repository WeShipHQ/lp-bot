/**
 * Smart Retry Strategy for Job Queue
 * 
 * Determines retry behavior based on error classification.
 */

import { Job } from "bullmq";
import { logger } from "@/utils/logger";
import {
  ResilienceError,
  isRetryableError,
  getErrorCategory,
  getErrorCode,
  ErrorCategory,
  extractErrorTelemetry,
  isPermanentFailure,
} from "@/utils/errors";

/**
 * Determine if a job should be retried based on error classification
 */
export function shouldRetryJob(job: Job, error: unknown): boolean {
  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts || 3;

  // Never retry if we've exhausted max attempts
  if (attemptsMade >= maxAttempts) {
    logger.warn(
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade,
        maxAttempts,
        error: (error as any)?.message,
      },
      "[RetryStrategy] Max attempts reached"
    );
    return false;
  }

  // Check if it's a permanent failure
  if (isPermanentFailure(error)) {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade,
        errorCode: getErrorCode(error),
      },
      "[RetryStrategy] Permanent failure detected, won't retry"
    );
    return false;
  }

  // Use ResilienceError's retry logic if available
  if (error instanceof ResilienceError) {
    const shouldRetry = error.shouldRetry(attemptsMade);
    
    if (!shouldRetry) {
      logger.info(
        {
          jobId: job.id,
          jobName: job.name,
          errorCode: error.code,
          category: error.category,
          attemptsMade,
        },
        "[RetryStrategy] Error is not retryable"
      );
    }
    
    return shouldRetry;
  }

  // Fall back to basic retry detection
  const isRetryable = isRetryableError(error);
  
  if (!isRetryable) {
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade,
        error: (error as any)?.message,
      },
      "[RetryStrategy] Error pattern suggests non-retryable"
    );
  }

  return isRetryable;
}

/**
 * Calculate retry delay with exponential backoff and category-specific adjustments
 */
export function calculateRetryDelay(
  job: Job,
  error: unknown,
  baseDelayMs: number = 2000,
  maxDelayMs: number = 60000
): number {
  const attemptsMade = job.attemptsMade;
  
  // Check for rate limit with explicit retry-after
  if (error instanceof ResilienceError && error.metadata.retryAfterMs) {
    const retryAfter = error.metadata.retryAfterMs as number;
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        retryAfterMs: retryAfter,
      },
      "[RetryStrategy] Using retry-after from error"
    );
    return Math.min(retryAfter, maxDelayMs);
  }

  // Category-specific delay adjustments
  let multiplier = 1;
  if (error instanceof ResilienceError) {
    switch (error.category) {
      case ErrorCategory.RATE_LIMIT:
        // Longer delay for rate limits
        multiplier = 3;
        break;
      case ErrorCategory.EXTERNAL_SERVICE:
        // Moderate delay for external services
        multiplier = 2;
        break;
      case ErrorCategory.BLOCKCHAIN:
        // Standard delay for blockchain
        multiplier = 1.5;
        break;
      case ErrorCategory.TIMEOUT:
        // Standard delay for timeouts
        multiplier = 1;
        break;
      default:
        multiplier = 1;
    }
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attemptsMade) * multiplier;
  const jitter = Math.random() * 0.3 + 0.85; // 85-115% of calculated delay
  const finalDelay = Math.min(exponentialDelay * jitter, maxDelayMs);

  logger.debug(
    {
      jobId: job.id,
      jobName: job.name,
      attemptsMade,
      baseDelayMs,
      exponentialDelay,
      finalDelayMs: Math.floor(finalDelay),
      errorCategory: getErrorCategory(error),
    },
    "[RetryStrategy] Calculated retry delay"
  );

  return Math.floor(finalDelay);
}

/**
 * Update pending transaction with error metadata for failed jobs
 */
export async function recordJobFailure(
  job: Job,
  error: unknown,
  db: any // Drizzle instance
): Promise<void> {
  try {
    const telemetry = extractErrorTelemetry(error);
    
    // Check if this job is associated with a transaction
    const signature = (job.data as any).signature;
    if (!signature) return;

    const errorMetadata = {
      errorCode: telemetry.errorCode,
      errorCategory: telemetry.errorCategory,
      errorMessage: telemetry.errorMessage,
      retryCount: job.attemptsMade,
      timestamp: telemetry.timestamp,
      jobId: job.id,
      jobName: job.name,
    };

    logger.info(
      {
        signature,
        ...errorMetadata,
      },
      "[RetryStrategy] Recording job failure metadata"
    );

    // Update will be done by the worker itself
  } catch (err) {
    logger.error(
      {
        jobId: job.id,
        error: err,
      },
      "[RetryStrategy] Failed to record job failure"
    );
  }
}

/**
 * Enhanced error handler for workers
 */
export function handleWorkerError(
  job: Job,
  error: unknown,
  workerName: string,
  retryDecision?: boolean
): void {
  const telemetry = extractErrorTelemetry(error, {
    jobId: job.id,
    jobName: job.name,
    workerName,
    attemptsMade: job.attemptsMade,
  });

  const logLevel =
    telemetry.severity === "CRITICAL" || telemetry.severity === "HIGH"
      ? "error"
      : "warn";

  logger[logLevel](
    {
      ...telemetry,
      jobData: job.data,
    },
    `[${workerName}] Job processing failed`
  );

  // Log retry decision
  const willRetry =
    typeof retryDecision === "boolean" ? retryDecision : shouldRetryJob(job, error);

  if (willRetry) {
    const delay = calculateRetryDelay(job, error);
    logger.info(
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        retryDelayMs: delay,
      },
      `[${workerName}] Will retry job`
    );
  } else {
    logger.warn(
      {
        jobId: job.id,
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        errorCode: telemetry.errorCode,
      },
      `[${workerName}] Job will not be retried`
    );
  }
}

/**
 * Check if a specific error code should skip retry
 */
export function isNonRetryableErrorCode(errorCode: string): boolean {
  const nonRetryableCodes = [
    "VALIDATION_ERROR",
    "INVALID_PARAMETER",
    "INSUFFICIENT_BALANCE",
    "AUTHORIZATION_ERROR",
    "WALLET_NOT_CONNECTED",
    "RESOURCE_NOT_FOUND",
    "POSITION_NOT_FOUND",
    "POOL_NOT_FOUND",
    "USER_NOT_FOUND",
    "TRANSACTION_SIMULATION_ERROR",
    "CONFIGURATION_ERROR",
  ];

  return nonRetryableCodes.includes(errorCode);
}
