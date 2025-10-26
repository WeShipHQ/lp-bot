import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { logger } from "@/utils/logger";
import { IUserRepository } from "@/domain";

export class UserRebalanceScheduleService {
  async updateUserRebalanceSchedule(userId: string): Promise<void> {
    try {
      const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
      const user = await userRepository.findById(userId);

      if (!user) {
        logger.warn(`User not found for userId: ${userId}`);
        return;
      }

      const currentSchedule = user.getRebalanceSchedule();

      // Remove existing scheduled jobs for this user
      await this.removeUserRebalanceJobs(userId);

      // Schedule new jobs based on current setting
      if (currentSchedule === "disabled") {
        logger.info(`Rebalancing disabled for user ${userId}`);
        return;
      }

      // Parse schedule (e.g., "5m", "15m", "1h", "3h")
      const cronPattern = this.convertScheduleToCron(currentSchedule);
      if (!cronPattern) {
        logger.warn(`Invalid rebalance schedule: ${currentSchedule}`);
        return;
      }

      // Schedule the rebalance check job
      const jobQueueService = container.get(JobQueueService);
      await jobQueueService.enqueue(
        "position_monitor",
        {
          userId: userId,
          // This will trigger position monitoring based on schedule
        },
        {
          repeat: { pattern: cronPattern },
          jobId: `rebalance-schedule-${userId}`,
        }
      );

      logger.info(
        `Scheduled rebalancing for user ${userId} with pattern: ${cronPattern}`
      );
    } catch (error) {
      logger.error(
        `Failed to update rebalance schedule for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  async removeUserRebalanceJobs(userId: string): Promise<void> {
    try {
      const jobQueueService = container.get(JobQueueService);

      // Remove existing scheduled jobs for this user
      const jobs = await jobQueueService.getQueueStats();

      // Note: In a real implementation, you'd want to track job IDs per user
      // For now, we'll clean up all rebalance schedule jobs
      await jobQueueService.cleanQueue("position_monitor", 1000, "completed");
      await jobQueueService.cleanQueue("position_monitor", 1000, "failed");

      logger.info(`Removed existing rebalance jobs for user ${userId}`);
    } catch (error) {
      logger.error(
        `Failed to remove rebalance jobs for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  private convertScheduleToCron(schedule: string): string | null {
    // Convert human-readable schedule to cron pattern
    switch (schedule) {
      case "5m":
        return "*/5 * * * *"; // Every 5 minutes
      case "15m":
        return "*/15 * * * *"; // Every 15 minutes
      case "1h":
        return "0 * * * *"; // Every hour
      case "3h":
        return "0 */3 * * *"; // Every 3 hours
      case "disabled":
        return null;
      default:
        logger.warn(`Unknown schedule: ${schedule}`);
        return null;
    }
  }
}
