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
}
