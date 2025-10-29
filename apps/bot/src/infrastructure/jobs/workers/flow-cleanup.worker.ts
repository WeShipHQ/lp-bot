/**
 * Flow Cleanup Worker
 * 
 * Automatically detects stale in-flight flows that exceed timeout thresholds
 * and takes appropriate action:
 * - Marks them as FAILED
 * - Sends user notifications
 * - Logs for manual review
 */

import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { FlowCleanupJobData, JOB_NOTIFICATION, JOB_FLOW_RECOVERY } from "../job-definitions";
import { logger } from "@/utils/logger";
import { db, pendingTransactions } from "@/db";
import { and, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { JobQueueService } from "../job-queue.service";

const DEFAULT_STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export class FlowCleanupWorker implements IWorker<FlowCleanupJobData> {
  constructor(private readonly jobQueue?: JobQueueService) {}

  async process(job: Job<FlowCleanupJobData>) {
    const { flowId, maxAgeMs } = job.data;
    const threshold = maxAgeMs ?? DEFAULT_STALE_THRESHOLD_MS;

    try {
      if (flowId) {
        return await this.cleanupSingleFlow(flowId, threshold);
      } else {
        return await this.cleanupStaleFlows(threshold);
      }
    } catch (error) {
      logger.error({ error, data: job.data }, "[FlowCleanupWorker] Error during cleanup");
      throw error;
    }
  }

  private async cleanupSingleFlow(flowId: string, threshold: number): Promise<void> {
    const flow = await db.query.pendingTransactions.findFirst({
      where: eq(pendingTransactions.id, flowId),
    });

    if (!flow) {
      logger.warn({ flowId }, "[FlowCleanupWorker] Flow not found");
      return;
    }

    if (this.isTerminalState(flow.flowStatus)) {
      logger.debug({ flowId, status: flow.flowStatus }, "[FlowCleanupWorker] Flow already in terminal state");
      return;
    }

    const ageMs = Date.now() - new Date(flow.flowStartedAt ?? flow.createdAt ?? Date.now()).getTime();

    if (ageMs < threshold) {
      logger.debug({ flowId, ageMs, threshold }, "[FlowCleanupWorker] Flow not yet stale");
      return;
    }

    await this.handleStaleFlow(flow as any);
  }

  private async cleanupStaleFlows(threshold: number): Promise<{ cleaned: number }> {
    const staleFlows = await db
      .select()
      .from(pendingTransactions)
      .where(
        and(
          notInArray(pendingTransactions.flowStatus, ["COMPLETED", "FAILED"]),
          or(
            lt(pendingTransactions.flowExpiresAt, new Date().toISOString()),
            isNull(pendingTransactions.flowExpiresAt)
          )
        )
      );

    logger.info({ count: staleFlows.length, threshold }, "[FlowCleanupWorker] Found stale flows");

    let cleaned = 0;

    for (const flow of staleFlows) {
      const ageMs = Date.now() - new Date(flow.flowStartedAt ?? flow.createdAt ?? Date.now()).getTime();

      if (ageMs >= threshold) {
        try {
          await this.handleStaleFlow(flow as any);
          cleaned++;
        } catch (error) {
          logger.error({ error, flowId: flow.id }, "[FlowCleanupWorker] Failed to clean up flow");
        }
      }
    }

    logger.info({ cleaned, total: staleFlows.length }, "[FlowCleanupWorker] Cleanup completed");

    return { cleaned };
  }

  private async handleStaleFlow(flow: any): Promise<void> {
    const flowId = flow.id;
    const userId = flow.userId;
    const operationType = flow.operationType;
    const flowState = flow.flowState;

    logger.warn(
      {
        flowId,
        userId,
        operationType,
        flowState,
        age: Date.now() - new Date(flow.flowStartedAt ?? flow.createdAt ?? Date.now()).getTime(),
      },
      "[FlowCleanupWorker] Handling stale flow"
    );

    // Determine if we should attempt recovery or mark as failed
    const isRecoverable = this.isRecoverableState(flowState);

    if (isRecoverable && this.jobQueue) {
      logger.info({ flowId }, "[FlowCleanupWorker] Attempting recovery for stale flow");

      // Enqueue recovery job
      try {
        await this.jobQueue.enqueue(JOB_FLOW_RECOVERY, {
          flowId,
          strategy: "retry",
        });

        // Update flow state to indicate recovery attempt
        await db
          .update(pendingTransactions)
          .set({
            flowStatus: "PROCESSING",
            flowLastTransitionAt: new Date().toISOString(),
            errorMessage: "Stale flow - recovery attempt initiated",
          })
          .where(eq(pendingTransactions.id, flowId));

        return;
      } catch (error) {
        logger.error({ error, flowId }, "[FlowCleanupWorker] Failed to enqueue recovery job");
        // Fall through to mark as failed
      }
    }

    // Mark as failed if not recoverable or recovery enqueue failed
    await db
      .update(pendingTransactions)
      .set({
        flowState: "FAILED",
        flowStatus: "FAILED",
        status: "FAILED",
        flowCompletedAt: new Date().toISOString(),
        errorMessage: "Flow timed out and exceeded retry threshold",
      })
      .where(eq(pendingTransactions.id, flowId));

    // Send notification to user
    if (this.jobQueue) {
      try {
        await this.jobQueue.enqueue(JOB_NOTIFICATION, {
          userId,
          notification: {
            type: "general",
            title: "Transaction Failed",
            messages: [
              {
                text: this.getFailureMessage(operationType, flowState),
                parseMode: "Markdown",
              },
            ],
          },
        });
      } catch (error) {
        logger.error({ error, flowId, userId }, "[FlowCleanupWorker] Failed to send notification");
      }
    }

    logger.info({ flowId }, "[FlowCleanupWorker] Stale flow marked as failed");
  }

  private isTerminalState(status: string | null): boolean {
    return status === "COMPLETED" || status === "FAILED";
  }

  private isRecoverableState(state: string | null): boolean {
    // States that can potentially be retried
    const recoverableStates = [
      "INITIATED",
      "VALIDATING",
      "BUILDING_TX",
      "TX_SUBMITTED",
      "TX_CONFIRMING",
      "SWAP_PENDING",
      "PERSISTING",
    ];

    return state ? recoverableStates.includes(state) : false;
  }

  private getFailureMessage(operationType: string, flowState: string): string {
    const opReadable = operationType.replace(/_/g, " ").toLowerCase();

    return [
      `⚠️ **Transaction Timeout**`,
      "",
      `Your ${opReadable} request timed out and couldn't be completed.`,
      "",
      `**Last state:** ${flowState}`,
      "",
      `This could be due to:`,
      `• Network congestion`,
      `• High gas fees`,
      `• RPC issues`,
      "",
      `Please try again. If the problem persists, contact support.`,
    ].join("\n");
  }
}
