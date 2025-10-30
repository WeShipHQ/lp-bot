/**
 * Error Display Utilities
 * 
 * Helper functions to display user-friendly error messages in the Telegram UI.
 * Integrates with ADR-001 error framework.
 */

import { PositionError } from "@/domain/position";
import { logger } from "@/utils/logger";

/**
 * Format an error for display in Telegram
 */
export function formatErrorForDisplay(error: unknown): string {
  // Handle domain errors (ADR-001)
  if (error instanceof PositionError) {
    logger.warn(
      {
        errorType: error.name,
        code: error.code,
        category: error.category,
        retryable: error.retryable,
        context: error.context,
      },
      "[ErrorDisplay] Domain error occurred"
    );

    return `❌ ${error.userMessage}`;
  }

  // Handle generic errors
  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, "[ErrorDisplay] Unexpected error");
    return "❌ An unexpected error occurred. Please try again later.";
  }

  // Handle unknown errors
  logger.error({ error }, "[ErrorDisplay] Unknown error type");
  return "❌ An unexpected error occurred. Please try again later.";
}

/**
 * Format an error with retry suggestion if applicable
 */
export function formatErrorWithRetry(error: unknown): string {
  const baseMessage = formatErrorForDisplay(error);

  // Add retry suggestion for retryable errors
  if (error instanceof PositionError && error.retryable) {
    return `${baseMessage}\n\n💡 This is a temporary issue. Please try again in a moment.`;
  }

  return baseMessage;
}

/**
 * Format an error with help link
 */
export function formatErrorWithHelp(error: unknown): string {
  const baseMessage = formatErrorForDisplay(error);
  return `${baseMessage}\n\nNeed help? Use /help to contact support.`;
}

/**
 * Check if error should show retry button
 */
export function shouldShowRetryButton(error: unknown): boolean {
  return error instanceof PositionError && error.retryable;
}

/**
 * Get error category for analytics/logging
 */
export function getErrorCategory(error: unknown): string {
  if (error instanceof PositionError) {
    return error.category;
  }
  return "UNKNOWN";
}
