import { Queue, Worker, Job, QueueOptions, WorkerOptions } from "bullmq";
import Redis from "ioredis";
import { logger } from "@/utils/logger";
import { CONFIG } from "@/config";
import { WorkerRegistry } from "./worker-registry";
import {
  JOB_NOTIFICATION,
  JOB_POSITION_MONITOR,
  JOB_REBALANCE,
  JOB_SWAP_EXECUTION,
  JOB_TX_CONFIRM,
  KnownJobNames,
  KnownJobDataMap,
} from "./job-definitions";
import { PositionMonitorWorker } from "./workers/position-monitor.worker";
import { RebalanceWorker } from "./workers/rebalance.worker";
import { NotificationWorker } from "./workers/notification.worker";
import { SwapExecutionWorker } from "./workers/swap-execution.worker";
import { TransactionConfirmWorker } from "./workers/transaction-confirm.worker";
import { TelegramClient } from "@/infrastructure/messaging/telegram-client";
import { NotificationService } from "@/infrastructure/messaging/notification.service";
import { UserRepository } from "@/infrastructure/database/repositories/user.repository";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import { db } from "@/db";
import { GetPositionUseCase } from "@/application/position/get-position.use-case";
import { RebalancePositionUseCase } from "@/application/position/rebalance-position.use-case";
import { dexRegistry } from "@/services/dex-registry.service";
import type { Telegraf } from "telegraf";
import type { BotContext } from "@/types/bot.types";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { container } from "../di/container";
import { SwapService } from "@/services/swap.service";

export type EnqueueOptions = {
  delay?: number;
  jobId?: string;
  attempts?: number;
  repeat?: { every?: number; pattern?: string };
};

type QueueEntry<N extends KnownJobNames> = {
  queue: Queue<KnownJobDataMap[N]>;
  worker: Worker<KnownJobDataMap[N]>;
  concurrency: number;
};

export class JobQueueService {
  private readonly redis: Redis;
  private readonly registry = new WorkerRegistry();
  private readonly entries = new Map<KnownJobNames, QueueEntry<any>>();
  private readonly qOpts: QueueOptions;
  private readonly producerOnly: boolean;

  constructor(opts?: { bot?: Telegraf<BotContext>; producerOnly?: boolean }) {
    this.redis = new Redis(CONFIG.REDIS.URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    this.producerOnly = !!opts?.producerOnly;

    // Common queue options
    this.qOpts = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 0,
        attempts: 1,
        backoff: { type: "exponential", delay: 2000 },
      },
    } as QueueOptions;

    if (!this.producerOnly) {
      // Instantiate infrastructure dependencies
      const userRepo = new UserRepository(db);
      const positionRepo = new PositionRepository(db);

      const telegramClient = opts?.bot
        ? new TelegramClient(opts.bot)
        : undefined;
      const notificationService = new NotificationService(
        telegramClient as any,
        userRepo,
        // pass this to avoid circular dependency; will be set after instantiation
        this
      );

      const getPositionUseCase = container.get(GetPositionUseCase);
      const rebalanceUseCase = new RebalancePositionUseCase(
        positionRepo,
        dexRegistry
      );

      const solana = new SolanaAdapter();

      // Register workers
      this.registry.register(
        JOB_POSITION_MONITOR,
        new PositionMonitorWorker(getPositionUseCase, notificationService, this)
      );
      this.registry.register(
        JOB_REBALANCE,
        new RebalanceWorker(rebalanceUseCase, notificationService)
      );
      if (telegramClient)
        this.registry.register(
          JOB_NOTIFICATION,
          new NotificationWorker(notificationService)
        );
      this.registry.register(
        JOB_SWAP_EXECUTION,
        new SwapExecutionWorker(container.get(SwapService))
      );
      this.registry.register(
        JOB_TX_CONFIRM,
        new TransactionConfirmWorker(solana, positionRepo)
      );

      // Setup queues and workers
      this.createQueueAndWorker(JOB_POSITION_MONITOR, this.qOpts, {
        concurrency: 5,
      });
      this.createQueueAndWorker(JOB_REBALANCE, this.qOpts, { concurrency: 2 });
      this.createQueueAndWorker(JOB_SWAP_EXECUTION, this.qOpts, {
        concurrency: 3,
      });
      this.createQueueAndWorker(JOB_TX_CONFIRM, this.qOpts, {
        concurrency: 20,
      });
      if (telegramClient)
        this.createQueueAndWorker(JOB_NOTIFICATION, this.qOpts, {
          concurrency: 10,
        });

      logger.info("[JobQueue] initialized");
    } else {
      logger.info("[JobQueue] producer-only mode initialized");
    }
  }

  private createQueueAndWorker<N extends KnownJobNames>(
    name: N,
    qOpts: QueueOptions,
    w: { concurrency: number }
  ) {
    const queue = new Queue<KnownJobDataMap[N]>(name, qOpts);
    const workerOpts: WorkerOptions = {
      connection: this.redis,
      concurrency: w.concurrency,
      maxStalledCount: 1,
      stalledInterval: 30000,
    } as WorkerOptions;

    const worker = new Worker<KnownJobDataMap[N]>(
      name,
      async (job: Job<KnownJobDataMap[N]>) => {
        const handler = this.registry.get(name);
        if (!handler) throw new Error(`No worker registered for ${name}`);
        return handler.process(job);
      },
      workerOpts
    );

    // Enhanced event listeners for better observability
    worker.on("completed", (job) => {
      logger.info(
        { jobId: job.id, name, duration: Date.now() - job.processedOn! },
        "[JobQueue] job completed"
      );
    });

    worker.on("failed", (job, err) => {
      logger.error(
        {
          jobId: job?.id,
          name,
          attemptsMade: job?.attemptsMade,
          data: job?.data,
          error: err?.message,
          stack: err?.stack,
        },
        "[JobQueue] job failed"
      );
    });

    worker.on("error", (err) => {
      logger.error(
        { name, error: err?.message, stack: err?.stack },
        "[JobQueue] worker error"
      );
    });

    worker.on("stalled", (jobId) => {
      logger.warn({ jobId, name }, "[JobQueue] job stalled");
    });

    worker.on("active", (job) => {
      logger.debug({ jobId: job.id, name }, "[JobQueue] job started");
    });

    this.entries.set(name, { queue, worker, concurrency: w.concurrency });
  }

  async enqueue<N extends KnownJobNames>(
    queueName: N,
    data: KnownJobDataMap[N],
    options?: EnqueueOptions
  ): Promise<void>;
  async enqueue(
    queueName: string,
    data: any,
    options?: EnqueueOptions
  ): Promise<void>;
  async enqueue(
    queueName: any,
    data: any,
    options?: EnqueueOptions
  ): Promise<void> {
    let entry = this.entries.get(queueName);
    if (!entry) {
      // In producer-only mode, lazily create a queue without a worker
      const queue = new Queue(queueName, this.qOpts);
      entry = {
        queue,
        worker: undefined as any,
        concurrency: 0,
      } as QueueEntry<any>;
      this.entries.set(queueName, entry);
    }
    await entry.queue.add(queueName, data, {
      delay: options?.delay,
      jobId: options?.jobId,
      attempts: options?.attempts,
      repeat: options?.repeat,
    });
  }

  async setupScheduledJobs() {
    // Thin orchestrator; scheduling handled by producers or dedicated cron outside
    return;
  }

  async getQueueStats() {
    const stats: Record<string, any> = {};
    for (const [name, entry] of Array.from(this.entries)) {
      stats[name] = await entry.queue.getJobCounts();
    }
    return stats;
  }

  async getJob<N extends KnownJobNames>(
    queueName: N,
    jobId: string
  ): Promise<Job<KnownJobDataMap[N]> | undefined> {
    const entry = this.entries.get(queueName);
    if (!entry) return undefined;
    return entry.queue.getJob(jobId);
  }

  async getJobState<N extends KnownJobNames>(
    queueName: N,
    jobId: string
  ): Promise<string | undefined> {
    const job = await this.getJob(queueName, jobId);
    if (!job) return undefined;
    return await job.getState();
  }

  async retryFailedJobs<N extends KnownJobNames>(
    queueName: N,
    maxRetries: number = 10
  ): Promise<number> {
    const entry = this.entries.get(queueName);
    if (!entry) return 0;

    const failed = await entry.queue.getFailed(0, maxRetries);
    let retried = 0;

    for (const job of failed) {
      await job.retry();
      retried++;
    }

    logger.info(
      { queueName, retriedCount: retried },
      "[JobQueue] retried failed jobs"
    );
    return retried;
  }

  async cleanQueue<N extends KnownJobNames>(
    queueName: N,
    grace: number = 1000,
    limit?: number
  ): Promise<void> {
    const entry = this.entries.get(queueName);
    if (!entry) return;

    await entry.queue.clean(grace, limit || 100, "completed");
    await entry.queue.clean(grace, limit || 50, "failed");

    logger.info({ queueName, grace, limit }, "[JobQueue] cleaned queue");
  }

  async pauseQueues() {
    await Promise.all(
      Array.from(this.entries.values()).map((e) => e.queue.pause())
    );
  }

  async resumeQueues() {
    await Promise.all(
      Array.from(this.entries.values()).map((e) => e.queue.resume())
    );
  }

  async shutdown() {
    logger.info("[JobQueue] shutting down");

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = 30000; // 30 seconds
    const startTime = Date.now();

    for (const [name, entry] of Array.from(this.entries)) {
      const remaining = shutdownTimeout - (Date.now() - startTime);
      if (remaining > 0 && entry.worker) {
        try {
          await entry.worker.close();
          logger.debug({ name }, "[JobQueue] worker closed");
        } catch (err) {
          logger.error({ name, err }, "[JobQueue] error closing worker");
        }
      }
    }

    await Promise.all(
      Array.from(this.entries.values()).map((e) => e.queue.close())
    );
    await this.redis.quit();
    logger.info("[JobQueue] shutdown completed");
  }
}
