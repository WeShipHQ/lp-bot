import { ITelegramClient } from "./telegram-client";
import type { SendOptions } from "./telegram-client";
import { IUserRepository } from "@/domain/user/user.repository";
import type { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import {
  JOB_NOTIFICATION,
  NotificationJobData,
  NotificationMessagePayload,
  NotificationType,
} from "@/infrastructure/jobs/job-definitions";
import {
  createErrorNotification,
  createTransactionFailedNotification,
  createPositionCreationErrorNotification,
  createSwapFailedNotification,
  createRebalanceFailedNotification,
  createServiceUnavailableNotification,
  createRateLimitNotification,
  type ErrorNotificationContext,
} from "./error-notifications";
import { normalizeError } from "@/utils/errors";
import { logger } from "@/utils/logger";

export interface Notification {
  type: NotificationType;
  title?: string;
  message?: string;
  messages?: NotificationMessagePayload[];
}

export class NotificationService {
  constructor(
    private readonly telegramClient: ITelegramClient,
    private readonly userRepository: IUserRepository,
    private readonly jobQueue?: JobQueueService
  ) {}

  async sendNotification(userId: string, notification: Notification): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) return;

    if (!user.hasNotificationEnabled(notification.type)) return;

    const chatId = Number(user.telegramId);

    if (notification.messages && notification.messages.length > 0) {
      for (const message of notification.messages) {
        const options: SendOptions = {};

        if (message.parseMode) {
          options.parse_mode = message.parseMode;
        }

        if (message.disableLinkPreview) {
          options.link_preview_options = { is_disabled: true };
        }

        await this.telegramClient.sendMessage(chatId, message.text, options);
      }
      return;
    }

    if (!notification.title || !notification.message) {
      return;
    }

    const text = `📣 ${notification.title}\n\n${notification.message}`;
    await this.telegramClient.sendMessage(chatId, text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
    });
  }

  async scheduleNotification(
    userId: string,
    notification: Notification,
    scheduleAt: Date
  ): Promise<void> {
    if (!this.jobQueue) return;
    const data: NotificationJobData = { userId, notification };
    await this.jobQueue.enqueue(JOB_NOTIFICATION, data, {
      delay: Math.max(0, scheduleAt.getTime() - Date.now()),
    });
  }

  /**
   * Send an error notification with smart formatting
   */
  async sendErrorNotification(
    error: unknown,
    context: ErrorNotificationContext
  ): Promise<void> {
    try {
      const normalized = normalizeError(error, context);
      const notification = createErrorNotification(normalized, context);
      await this.sendNotification(context.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: context.userId,
          operation: context.operation,
        },
        "[NotificationService] Failed to send error notification"
      );
    }
  }

  /**
   * Send a transaction failed notification
   */
  async sendTransactionFailedNotification(
    error: unknown,
    transactionContext: {
      userId: string;
      signature: string;
      operation: string;
      canRetry?: boolean;
    }
  ): Promise<void> {
    try {
      const notification = createTransactionFailedNotification(error, transactionContext);
      await this.sendNotification(transactionContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: transactionContext.userId,
          signature: transactionContext.signature,
        },
        "[NotificationService] Failed to send transaction failed notification"
      );
    }
  }

  /**
   * Send a position creation error notification
   */
  async sendPositionCreationErrorNotification(
    error: unknown,
    positionContext: {
      userId: string;
      poolAddress?: string;
      dex?: string;
      signature?: string;
      depositAmount?: string;
      token?: string;
    }
  ): Promise<void> {
    try {
      const notification = createPositionCreationErrorNotification(error, positionContext);
      await this.sendNotification(positionContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: positionContext.userId,
        },
        "[NotificationService] Failed to send position creation error notification"
      );
    }
  }

  /**
   * Send a swap failed notification
   */
  async sendSwapFailedNotification(
    error: unknown,
    swapContext: {
      userId: string;
      inputToken: string;
      outputToken: string;
      inputAmount: string;
      signature?: string;
    }
  ): Promise<void> {
    try {
      const notification = createSwapFailedNotification(error, swapContext);
      await this.sendNotification(swapContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: swapContext.userId,
        },
        "[NotificationService] Failed to send swap failed notification"
      );
    }
  }

  /**
   * Send a rebalance failed notification
   */
  async sendRebalanceFailedNotification(
    error: unknown,
    rebalanceContext: {
      userId: string;
      positionId: string;
      positionAddress?: string;
      reason?: string;
    }
  ): Promise<void> {
    try {
      const notification = createRebalanceFailedNotification(error, rebalanceContext);
      await this.sendNotification(rebalanceContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: rebalanceContext.userId,
          positionId: rebalanceContext.positionId,
        },
        "[NotificationService] Failed to send rebalance failed notification"
      );
    }
  }

  /**
   * Send a service unavailable notification
   */
  async sendServiceUnavailableNotification(
    serviceName: string,
    serviceContext: {
      userId: string;
      operation?: string;
      estimatedRecoveryMinutes?: number;
    }
  ): Promise<void> {
    try {
      const notification = createServiceUnavailableNotification(serviceName, serviceContext);
      await this.sendNotification(serviceContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: serviceContext.userId,
          serviceName,
        },
        "[NotificationService] Failed to send service unavailable notification"
      );
    }
  }

  /**
   * Send a rate limit notification
   */
  async sendRateLimitNotification(rateLimitContext: {
    userId: string;
    operation: string;
    retryAfterSeconds?: number;
  }): Promise<void> {
    try {
      const notification = createRateLimitNotification(rateLimitContext);
      await this.sendNotification(rateLimitContext.userId, notification);
    } catch (err) {
      logger.error(
        {
          error: err,
          userId: rateLimitContext.userId,
        },
        "[NotificationService] Failed to send rate limit notification"
      );
    }
  }
}
