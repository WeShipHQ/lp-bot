import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { RebalanceJobData } from "../job-definitions";
import { RebalancePositionUseCase } from "@/application/position/rebalance-position.use-case";
import { NotificationService } from "@/infrastructure/messaging/notification.service";
import { logger } from "@/utils/logger";

export class RebalanceWorker implements IWorker<RebalanceJobData> {
  constructor(
    private readonly rebalancePositionUseCase: RebalancePositionUseCase,
    private readonly notificationService: NotificationService,
  ) {}

  async process(job: Job<RebalanceJobData>) {
    const start = Date.now();
    const { userId, positionId, userAddress, walletId, strategy, reason } = job.data;

    try {
      const result = await this.rebalancePositionUseCase.execute({
        userId,
        positionId,
        userAddress,
        walletId,
        newStrategy: strategy,
        metadata: { trigger: reason },
      });

      if (result.success) {
        try {
          await this.notificationService.sendNotification(userId, {
            type: 'rebalance',
            title: 'Rebalance Executed',
            message: `Rebalance successful for position ${positionId}. Tx: ${result.signature ?? ''}`,
          });
        } catch {}
        const duration = Date.now() - start;
        logger.info({ positionId, duration }, '[RebalanceWorker] Rebalance success');
        return { success: true, signature: result.signature };
      }

      try {
        await this.notificationService.sendNotification(userId, {
          type: 'rebalance',
          title: 'Rebalance Failed',
          message: `Rebalance failed for position ${positionId}: ${result.error ?? 'Unknown error'}`,
        });
      } catch {}

      logger.warn({ positionId, error: result.error }, '[RebalanceWorker] Rebalance failed');
      return { success: false, error: result.error };
    } catch (error) {
      logger.error({ error, positionId }, '[RebalanceWorker] Unhandled error');
      try {
        await this.notificationService.sendNotification(userId, {
          type: 'rebalance',
          title: 'Rebalance Error',
          message: `An error occurred during rebalance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      } catch {}
      throw error;
    }
  }
}
