import { ITelegramClient } from "./telegram-client";
import { IUserRepository } from "@/domain/user/user.repository";
import { JobQueueService } from "@/services/job-queue.service";

export interface Notification {
  type: "price" | "rebalance" | "general";
  title: string;
  message: string;
}

export class NotificationService {
  constructor(
    private readonly telegramClient: ITelegramClient,
    private readonly userRepository: IUserRepository,
    private readonly jobQueue: JobQueueService
  ) {}

  async sendNotification(userId: string, notification: Notification): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) return;

    if (!user.hasNotificationEnabled(notification.type)) return;

    const chatId = Number(user.telegramId);
    const text = `📣 ${notification.title}\n\n${notification.message}`;
    await this.telegramClient.sendMessage(chatId, text, { parse_mode: "Markdown", link_preview_options: { is_disabled: true } });
  }

  async scheduleNotification(
    userId: string,
    notification: Notification,
    scheduleAt: Date
  ): Promise<void> {
    await this.jobQueue.addJob("delayed-notification", {
      userId,
      notification,
    }, {
      delay: Math.max(0, scheduleAt.getTime() - Date.now()),
    });
  }
}
