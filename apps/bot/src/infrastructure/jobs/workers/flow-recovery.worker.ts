/**
 * Flow Recovery Worker
 * 
 * Attempts to resume or compensate flows that previously failed or became stale.
 */

import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { FlowRecoveryJobData, JOB_NOTIFICATION } from "../job-definitions";
import { logger } from "@/utils/logger";
import { FlowRepository, FlowService } from "@/services/flows/flow-state-machine";
import { FlowType } from "@/services/flows/flow-types";
import { db, pendingTransactions } from "@/db";
import { eq } from "drizzle-orm";
import { JobQueueService } from "../job-queue.service";

export class FlowRecoveryWorker implements IWorker<FlowRecoveryJobData> {
  private readonly repository: FlowRepository;
  private readonly flowService: FlowService;

  constructor(
    repository?: FlowRepository,
    private readonly jobQueue?: JobQueueService
  ) {
    this.repository = repository ?? new FlowRepository();
    this.flowService = new FlowService(this.repository);
  }

  async process(job: Job<FlowRecoveryJobData>) {
    const { flowId, strategy = "retry" } = job.data;

    try {
      const flow = await this.repository.findById(flowId);

      if (!flow) {
        logger.warn({ flowId }, "[FlowRecoveryWorker] Flow not found");
        return { recovered: false, reason: "not_found" };
      }

      if (flow.status === "COMPLETED") {
        logger.info({ flowId }, "[FlowRecoveryWorker] Flow already completed");
        return { recovered: true, alreadyCompleted: true };
      }

      if (flow.status === "FAILED" && strategy === "manual") {
        logger.info({ flowId }, "[FlowRecoveryWorker] Flow marked for manual intervention");
        await this.markForManualReview(flowId, flow.flowType);
        return { recovered: false, reason: "manual_intervention" };
      }

      const maxRetries = flow.checkpoint.maxRetries ?? 3;
      const retryCount = flow.checkpoint.retryCount ?? 0;

      if (retryCount >= maxRetries && strategy === "retry") {
        logger.warn({ flowId, retryCount, maxRetries }, "[FlowRecoveryWorker] Retry limit reached");
        await this.markForManualReview(flowId, flow.flowType);
        return { recovered: false, reason: "retry_limit" };
      }

      logger.info({ flowId, strategy }, "[FlowRecoveryWorker] Attempting recovery");

      switch (strategy) {
        case "retry":
          return await this.retryFlow(flowId, flow.flowType);
        case "compensate":
          return await this.compensateFlow(flowId, flow.flowType);
        default:
          logger.warn({ flowId, strategy }, "[FlowRecoveryWorker] Unknown strategy");
          return { recovered: false, reason: "unknown_strategy" };
      }
    } catch (error) {
      logger.error({ error, data: job.data }, "[FlowRecoveryWorker] Recovery error");
      throw error;
    }
  }

  private async retryFlow(flowId: string, flowType: FlowType) {
    await db
      .update(pendingTransactions)
      .set({
        flowStatus: "PROCESSING",
        flowState: "INITIATED",
        flowLastTransitionAt: new Date().toISOString(),
        errorMessage: "Flow recovery triggered: retry",
        retryCount: 0,
      })
      .where(eq(pendingTransactions.id, flowId));

    // Re-enqueue flow processing job (will create new orchestrator job later)
    if (this.jobQueue) {
      await this.jobQueue.enqueue("flow-runner", { flowId, flowType });
    }

    logger.info({ flowId }, "[FlowRecoveryWorker] Flow re-enqueued for processing");

    return { recovered: true, strategy: "retry" };
  }

  private async compensateFlow(flowId: string, flowType: FlowType) {
    await db
      .update(pendingTransactions)
      .set({
        flowStatus: "COMPENSATING",
        flowState: "COMPENSATING",
        flowLastTransitionAt: new Date().toISOString(),
        errorMessage: "Flow recovery triggered: compensation",
      })
      .where(eq(pendingTransactions.id, flowId));

    // TODO: Implement specific compensation logic per flow type
    logger.warn({ flowId, flowType }, "[FlowRecoveryWorker] Compensation not yet implemented");

    // Notify user
    if (this.jobQueue) {
      await this.jobQueue.enqueue(JOB_NOTIFICATION, {
        userId: (await db.query.pendingTransactions.findFirst({ where: eq(pendingTransactions.id, flowId) }))?.userId ?? "",
        notification: {
          type: "general",
          title: "Transaction Recovery",
          messages: [
            {
              text: "Compensation routines triggered for your transaction. Support will contact you if manual action is required.",
              parseMode: "Markdown",
            },
          ],
        },
      });
    }

    return { recovered: false, strategy: "compensate", implemented: false };
  }

  private async markForManualReview(flowId: string, flowType: FlowType) {
    await db
      .update(pendingTransactions)
      .set({
        flowStatus: "FAILED",
        flowState: "FAILED",
        flowCompletedAt: new Date().toISOString(),
        errorMessage: `Flow requires manual review - type: ${flowType}`,
      })
      .where(eq(pendingTransactions.id, flowId));

    // Notify support/admin channel (TODO: hook into admin tooling)
    logger.warn({ flowId, flowType }, "[FlowRecoveryWorker] Flow marked for manual review");
  }
}
