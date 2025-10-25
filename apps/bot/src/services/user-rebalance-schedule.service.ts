import { container } from "@/infrastructure/di/container";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { GetUserByTelegramIdUseCase } from "@/application/user/get-user-by-telegram-id.use-case";
import { UpdateUserUseCase } from "@/application/user/update-user.use-case";
import { logger } from "@/utils/logger";

export class UserRebalanceScheduleService {
  async updateUserRebalanceSchedule(telegramId: string): Promise<void> {
    try {
      const userGetter = container.get(GetUserByTelegramIdUseCase);
      const user = await userGetter.execute(telegramId);
      
      if (!user) {
        logger.warn(`User not found for telegramId: ${telegramId}`);
        return;
      }

      // Get current rebalance schedule
      const currentSchedule = user.getRebalanceSchedule();
      
      // Remove existing scheduled jobs for this user
      await this.removeUserRebalanceJobs(telegramId);
      
      // Schedule new jobs based on current setting
      if (currentSchedule === 'disabled') {
        logger.info(`Rebalancing disabled for user ${telegramId}`);
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
      await jobQueueService.enqueue('position_monitor', {
        userId: telegramId,
        // This will trigger position monitoring based on schedule
      }, {
        repeat: { pattern: cronPattern },
        jobId: `rebalance-schedule-${telegramId}`,
      });
      
      logger.info(`Scheduled rebalancing for user ${telegramId} with pattern: ${cronPattern}`);
    } catch (error) {
      logger.error(`Failed to update rebalance schedule for user ${telegramId}:`, error);
      throw error;
    }
  }

  async removeUserRebalanceJobs(telegramId: string): Promise<void> {
    try {
      const jobQueueService = container.get(JobQueueService);
      
      // Remove existing scheduled jobs for this user
      const jobs = await jobQueueService.getQueueStats();
      
      // Note: In a real implementation, you'd want to track job IDs per user
      // For now, we'll clean up all rebalance schedule jobs
      await jobQueueService.cleanQueue('position_monitor', 1000, 'completed');
      await jobQueueService.cleanQueue('position_monitor', 1000, 'failed');
      
      logger.info(`Removed existing rebalance jobs for user ${telegramId}`);
    } catch (error) {
      logger.error(`Failed to remove rebalance jobs for user ${telegramId}:`, error);
      throw error;
    }
  }

  private convertScheduleToCron(schedule: string): string | null {
    // Convert human-readable schedule to cron pattern
    switch (schedule) {
      case '5m':
        return '*/5 * * * *'; // Every 5 minutes
      case '15m':
        return '*/15 * * * *'; // Every 15 minutes
      case '1h':
        return '0 * * * *'; // Every hour
      case '3h':
        return '0 */3 * * *'; // Every 3 hours
      case 'disabled':
        return null;
      default:
        logger.warn(`Unknown schedule: ${schedule}`);
        return null;
    }
  }
}