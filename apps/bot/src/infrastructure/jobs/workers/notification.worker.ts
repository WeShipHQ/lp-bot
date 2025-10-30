import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { NotificationJobData } from "../job-definitions";
import { NotificationService } from "@/infrastructure/messaging/notification.service";
import { logger } from "@/utils/logger";

export class NotificationWorker implements IWorker<NotificationJobData> {
  constructor(private readonly notificationService: NotificationService) {}

  async process(job: Job<NotificationJobData>) {
    const { userId, notification } = job.data;
    try {
      await this.notificationService.sendNotification(userId, notification);
      return { delivered: true };
    } catch (error) {
      // Handle rate limiting by retrying via BullMQ backoff
      logger.warn(
        { error },
        "[NotificationWorker] Send failed; will rely on backoff/retry"
      );
      throw error;
    }
  }
}
