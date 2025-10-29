import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  JOB_POSITION_MONITOR,
  JOB_REBALANCE,
  PositionMonitorJobData,
  RebalanceJobData,
} from "../job-definitions";
import { GetPositionUseCase } from "@/application/position/get-position.use-case";
import { NotificationService } from "@/infrastructure/messaging/notification.service";
import { logger } from "@/utils/logger";

export interface ThinJobQueueLike {
  enqueue: (
    queueName: string,
    data: any,
    options?: { delay?: number; jobId?: string; attempts?: number }
  ) => Promise<void>;
}

export class PositionMonitorWorker implements IWorker<PositionMonitorJobData> {
  constructor(
    private readonly getPositionUseCase: GetPositionUseCase,
    private readonly notificationService: NotificationService,
    private readonly jobQueue: ThinJobQueueLike
  ) {}

  async process(job: Job<PositionMonitorJobData>) {
    logger.info({ jobId: job.id }, "[PositionMonitorWorker] Processing job");

    const start = Date.now();
    const { userId, positionId } = job.data;
    if (!userId || !positionId) return { skipped: true };

    try {
      const res = await this.getPositionUseCase.execute({ positionId });
      if (!res.success || !res.position)
        return { success: false, reason: res.error || "not_found" };

      const position = res.position;
      const onchain = res.onchain;

      const inRange = onchain?.inRange ?? true;
      const activeId = onchain?.metadata?.activeId as number | undefined;
      const lowerId = onchain?.metadata?.lowerBinId as number | undefined;
      const upperId = onchain?.metadata?.upperBinId as number | undefined;

      // If position is out of range, send a notification
      if (inRange === false) {
        try {
          await this.notificationService.sendNotification(userId, {
            type: "rebalance",
            title: "Position Out of Range",
            message: `Your position ${position.positionAddress.slice(0, 6)}... is out of range${typeof activeId === "number" && typeof lowerId === "number" && typeof upperId === "number" ? ` (active ${activeId}, range ${lowerId}-${upperId})` : ""}.`,
          });
        } catch (err) {
          logger.warn(
            { err },
            "[PositionMonitorWorker] Failed to send out-of-range notification"
          );
        }
      }

      // Check if rebalancing needed: if out of range and auto-rebalance enabled
      const shouldRebalance =
        inRange === false && (position as any)["isRebalancingEnabled"];
      if (shouldRebalance) {
        const userAddress =
          (res.onchain?.metadata?.userAddress as string) || res.userAddress || "";
        if (userAddress) {
          const payload: RebalanceJobData = {
            userId,
            positionId,
            userAddress,
            reason: "out_of_range_auto",
          };
          try {
            await this.jobQueue.enqueue(JOB_REBALANCE, payload, {
              attempts: 1,
            });
          } catch (err) {
            logger.error(
              { err },
              "[PositionMonitorWorker] Failed to enqueue rebalance job"
            );
          }
        } else {
          logger.debug(
            { positionId },
            "[PositionMonitorWorker] Auto-rebalance skipped: missing userAddress"
          );
        }
      }

      // Re-enqueue monitoring in 5 minutes
      try {
        await this.jobQueue.enqueue(
          JOB_POSITION_MONITOR,
          { userId, positionId },
          { delay: 5 * 60 * 1000 }
        );
      } catch (err) {
        logger.warn(
          { err },
          "[PositionMonitorWorker] Failed to re-enqueue monitoring job"
        );
      }

      const duration = Date.now() - start;
      logger.debug(
        { positionId, duration },
        "[PositionMonitorWorker] processed"
      );
      return { processed: true, inRange, rebalanced: shouldRebalance };
    } catch (error) {
      logger.error({ error }, "[PositionMonitorWorker] Error");
      // Re-enqueue with backoff
      try {
        await this.jobQueue.enqueue(JOB_POSITION_MONITOR, job.data, {
          delay: 60 * 1000,
        });
      } catch {}
      throw error;
    }
  }
}
