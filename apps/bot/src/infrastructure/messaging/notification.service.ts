import { ITelegramClient } from "./telegram-client";
import type { SendOptions, SendPhotoOptions } from "./telegram-client";
import { IUserRepository } from "@/domain/user/user.repository";
import type { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import {
  JOB_NOTIFICATION,
  NotificationJobData,
  NotificationType,
} from "@/infrastructure/jobs/job-definitions";
import { MessageGateway, MessageBody } from "@/domain/message";

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
    private readonly messageGateway: MessageGateway,
    private readonly jobQueue?: JobQueueService
  ) {}

  async sendNotification(userId: string, notification: Notification): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) return;

    if (!user.hasNotificationEnabled(notification.type)) return;

    const chatId = Number(user.telegramId);

    if (notification.messages && notification.messages.length > 0) {
      for (const message of notification.messages) {
        if (message.type === "photo" && message.media) {
          // Send photo using message gateway with proper format
          await this.messageGateway.send({
            context: {
              chatId,
              replyToMessageId: undefined,
              threadId: undefined,
            },
            payload: {
              key: `notification-${Date.now()}`,
              body: {
                kind: "photo",
                data: message.media.source,
                caption: message.text,
                parseMode: message.parseMode,
                disableLinkPreview: message.disableLinkPreview,
              },
            },
          });
        } else {
          // Send text message using message gateway
          await this.messageGateway.send({
            context: {
              chatId,
              replyToMessageId: undefined,
              threadId: undefined,
            },
            payload: {
              key: `notification-${Date.now()}`,
              body: {
                kind: "text",
                text: message.text || "",
                parseMode: message.parseMode,
                disableLinkPreview: message.disableLinkPreview,
              },
            },
          });
        }
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
