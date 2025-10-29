/**
 * Error Notification Templates
 * 
 * Provides structured, user-friendly notification templates for various error scenarios.
 */

import {
  ResilienceError,
  ErrorCategory,
  createErrorSummary,
  formatErrorForNotification,
} from "@/utils/errors";
import type { Notification } from "./notification.service";
import { getSolscanLink } from "@/utils/link";
import { link } from "@/utils/misc";

export interface ErrorNotificationContext {
  operation: string;
  userId: string;
  signature?: string;
  positionId?: string;
  poolAddress?: string;
  dex?: string;
  includeTechnicalDetails?: boolean;
}

/**
 * Create an error notification from any error
 */
export function createErrorNotification(
  error: unknown,
  context: ErrorNotificationContext
): Notification {
  const {
    operation,
    signature,
    positionId,
    includeTechnicalDetails = false,
  } = context;

  // Format the main error message
  let message = formatErrorForNotification(
    error,
    operation,
    includeTechnicalDetails
  );

  // Add relevant links based on context
  const links: string[] = [];
  if (signature) {
    links.push(link("View Transaction", getSolscanLink("tx", signature)));
  }

  if (links.length > 0) {
    message += `\n\n*Links:*\n${links.join(" | ")}`;
  }

  // Add support contact
  message += "\n\n_Need help? Use /help to contact support._";

  return {
    type: "general",
    title: error instanceof ResilienceError ? operation : `${operation} Failed`,
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
    ],
  };
}

/**
 * Position creation error notification
 */
export function createPositionCreationErrorNotification(
  error: unknown,
  context: {
    userId: string;
    poolAddress?: string;
    dex?: string;
    signature?: string;
    depositAmount?: string;
    token?: string;
  }
): Notification {
  const summary = createErrorSummary(error, "Position Creation");

  let message = `❌ *Position Creation Failed*\n\n`;
  message += `${summary.problem}\n\n`;

  // Add context-specific information
  if (context.depositAmount && context.token) {
    message += `*Your Attempt:*\n`;
    message += `• Deposit: ${context.depositAmount} ${context.token}\n`;
    if (context.poolAddress) {
      message += `• Pool: \`${context.poolAddress.substring(0, 8)}...\`\n`;
    }
    message += "\n";
  }

  // Add next steps
  message += `*What to do next:*\n`;
  summary.nextSteps.forEach((step, i) => {
    message += `${i + 1}. ${step}\n`;
  });

  // Add funds safety message
  message += "\n✅ *Your funds are safe.*";
  if (error instanceof ResilienceError && error.category === ErrorCategory.BLOCKCHAIN) {
    message += " No transaction was submitted to the blockchain.";
  }

  // Add support link
  message += "\n\n_Use /help for support_";

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
    ],
  };
}

/**
 * Transaction failed notification with recovery options
 */
export function createTransactionFailedNotification(
  error: unknown,
  context: {
    userId: string;
    signature: string;
    operation: string;
    canRetry?: boolean;
  }
): Notification {
  const summary = createErrorSummary(error, context.operation);

  let message = `❌ *Transaction Failed*\n\n`;
  message += `*Operation:* ${context.operation}\n\n`;
  message += `${summary.problem}\n\n`;

  // Add transaction link
  message += `*Transaction:*\n`;
  message += `${link("View on Solscan", getSolscanLink("tx", context.signature))}\n\n`;

  // Explain what happened to funds
  message += `*Fund Status:*\n`;
  if (error instanceof ResilienceError) {
    switch (error.category) {
      case ErrorCategory.BLOCKCHAIN:
        message += `• Your funds are safe in your wallet\n`;
        message += `• Transaction did not complete\n`;
        message += `• Gas fees may have been deducted\n`;
        break;
      default:
        message += `• Check your wallet balance\n`;
        message += `• Transaction status may be pending\n`;
    }
  } else {
    message += `• Check your wallet to confirm balance\n`;
  }

  message += "\n";

  // Add next steps
  message += `*What to do next:*\n`;
  summary.nextSteps.forEach((step, i) => {
    message += `${i + 1}. ${step}\n`;
  });

  if (summary.canRetry || context.canRetry) {
    message += "\n✅ You can try this operation again.";
  }

  message += "\n\n_Need help? Use /help to contact support._";

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
    ],
  };
}

/**
 * Service unavailable notification
 */
export function createServiceUnavailableNotification(
  serviceName: string,
  context: {
    userId: string;
    operation?: string;
    estimatedRecoveryMinutes?: number;
  }
): Notification {
  let message = `⚠️ *Service Temporarily Unavailable*\n\n`;
  message += `${serviceName} is currently experiencing issues.\n\n`;

  if (context.operation) {
    message += `*Affected Operation:* ${context.operation}\n\n`;
  }

  message += `*What this means:*\n`;
  message += `• Your funds are safe\n`;
  message += `• No action is required from you\n`;
  message += `• Normal service will resume shortly\n\n`;

  if (context.estimatedRecoveryMinutes) {
    message += `*Estimated Recovery:* ${context.estimatedRecoveryMinutes} minutes\n\n`;
  }

  message += `*What to do next:*\n`;
  message += `1. Wait a few minutes\n`;
  message += `2. Try your operation again\n`;
  message += `3. Check our status page for updates\n\n`;

  message += `_We apologize for the inconvenience._`;

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: false,
      },
    ],
  };
}

/**
 * Rebalance failed notification
 */
export function createRebalanceFailedNotification(
  error: unknown,
  context: {
    userId: string;
    positionId: string;
    positionAddress?: string;
    reason?: string;
  }
): Notification {
  const summary = createErrorSummary(error, "Rebalance");

  let message = `❌ *Position Rebalance Failed*\n\n`;
  message += `${summary.problem}\n\n`;

  message += `*Your Position:*\n`;
  if (context.positionAddress) {
    message += `• Address: \`${context.positionAddress.substring(0, 8)}...\`\n`;
  }
  message += `• Your position remains unchanged\n`;
  message += `• No fees were charged\n\n`;

  message += `*What to do next:*\n`;
  summary.nextSteps.forEach((step, i) => {
    message += `${i + 1}. ${step}\n`;
  });

  message += "\n";

  if (summary.canRetry) {
    message += `✅ You can manually rebalance this position from the portfolio view.`;
  } else {
    message += `⚠️ This position may need to be closed and recreated.`;
  }

  message += "\n\n_Use /portfolio to view your positions_";

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
    ],
  };
}

/**
 * Swap failed notification
 */
export function createSwapFailedNotification(
  error: unknown,
  context: {
    userId: string;
    inputToken: string;
    outputToken: string;
    inputAmount: string;
    signature?: string;
  }
): Notification {
  const summary = createErrorSummary(error, "Token Swap");

  let message = `❌ *Swap Failed*\n\n`;
  message += `*Swap Details:*\n`;
  message += `• ${context.inputAmount} ${context.inputToken} → ${context.outputToken}\n\n`;

  message += `${summary.problem}\n\n`;

  message += `*Fund Status:*\n`;
  message += `• Your ${context.inputToken} is safe in your wallet\n`;
  message += `• No swap was executed\n`;
  if (context.signature) {
    message += `• ${link("View Transaction", getSolscanLink("tx", context.signature))}\n`;
  }
  message += "\n";

  message += `*What to do next:*\n`;
  summary.nextSteps.forEach((step, i) => {
    message += `${i + 1}. ${step}\n`;
  });

  if (summary.canRetry) {
    message += "\n✅ You can try this swap again.";
  }

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: true,
      },
    ],
  };
}

/**
 * Rate limit exceeded notification
 */
export function createRateLimitNotification(
  context: {
    userId: string;
    operation: string;
    retryAfterSeconds?: number;
  }
): Notification {
  let message = `⏱️ *Rate Limit Exceeded*\n\n`;
  message += `You've made too many requests for: *${context.operation}*\n\n`;

  message += `*Why this happened:*\n`;
  message += `• Too many operations in a short time\n`;
  message += `• This protects the system and your account\n\n`;

  message += `*What to do next:*\n`;
  if (context.retryAfterSeconds) {
    message += `1. Wait ${context.retryAfterSeconds} seconds\n`;
  } else {
    message += `1. Wait a moment before trying again\n`;
  }
  message += `2. Then retry your operation\n\n`;

  message += `✅ Your account and funds are safe.`;

  return {
    type: "general",
    messages: [
      {
        text: message,
        parseMode: "Markdown",
        disableLinkPreview: false,
      },
    ],
  };
}
