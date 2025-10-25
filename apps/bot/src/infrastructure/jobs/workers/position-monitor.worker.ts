import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  JOB_POSITION_MONITOR,
  JOB_REBALANCE,
  NotificationJobData,
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
    logger.info("[PositionMonitorWorker] Processing job", { jobId: job.id });

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

      // Check Stop Loss and Take Profit conditions
      const currentPrice = onchain?.metadata?.currentPrice || 0;
      const initialPriceUSD = Number(position.initialValueUSD) / Number(position.initialValueSOL) * (onchain?.metadata?.solPrice || 0);
      const priceChangePercentage = ((currentPrice - initialPriceUSD) / initialPriceUSD) * 100;

      const stopLossTriggered = position.slPercentage && priceChangePercentage <= -(position.slPercentage);
      const takeProfitTriggered = position.tpPercentage && priceChangePercentage >= position.tpPercentage;

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

      // Check Stop Loss and Take Profit triggers
      if (stopLossTriggered) {
        try {
          await this.notificationService.sendNotification(userId, {
            type: "position",
            title: "🛡️ Stop Loss Triggered",
            message: `Your position ${position.positionAddress.slice(0, 6)}... has hit stop loss at ${Math.abs(priceChangePercentage).toFixed(2)}%. Auto-closing position to limit losses.`,
          });
        } catch (err) {
          logger.warn(
            { err },
            "[PositionMonitorWorker] Failed to send stop loss notification"
          );
        }
      }

      if (takeProfitTriggered) {
        try {
          await this.notificationService.sendNotification(userId, {
            type: "position",
            title: "🎯 Take Profit Triggered",
            message: `Your position ${position.positionAddress.slice(0, 6)}... has hit take profit at ${priceChangePercentage.toFixed(2)}%. Auto-closing position to secure gains.`,
          });
        } catch (err) {
          logger.warn(
            { err },
            "[PositionMonitorWorker] Failed to send take profit notification"
          );
        }
      }

      // Check if rebalancing needed: if out of range and auto-rebalance enabled
      const shouldRebalance =
        inRange === false && (position as any)["isRebalancingEnabled"];
      if (shouldRebalance) {
        const userAddress =
          (res.onchain?.metadata?.userAddress as string) || "";
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

      // Check if position should be closed due to Stop Loss or Take Profit
      const shouldClose = stopLossTriggered || takeProfitTriggered;
      if (shouldClose) {
        const userAddress =
          (res.onchain?.metadata?.userAddress as string) || "";
        if (userAddress) {
          const reason = stopLossTriggered ? "stop_loss_triggered" : "take_profit_triggered";
          const payload: RebalanceJobData = {
            userId,
            positionId,
            userAddress,
            reason,
          };
          try {
            await this.jobQueue.enqueue(JOB_REBALANCE, payload, {
              attempts: 1,
            });
            logger.info("[PositionMonitorWorker] Enqueued close position job", {
              positionId,
              reason,
              userId,
            });
          } catch (err) {
            logger.error(
              { err },
              "[PositionMonitorWorker] Failed to enqueue close position job"
            );
          }
        } else {
          logger.debug(
            { positionId },
            "[PositionMonitorWorker] Close position skipped: missing userAddress"
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
