import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '@/utils/logger';
import { CONFIG } from '@/config';
import { WorkerRegistry } from './worker-registry';
import { JOB_NOTIFICATION, JOB_POSITION_MONITOR, JOB_REBALANCE, JOB_TX_CONFIRM, KnownJobNames, KnownJobDataMap } from './job-definitions';
import { PositionMonitorWorker } from './workers/position-monitor.worker';
import { RebalanceWorker } from './workers/rebalance.worker';
import { NotificationWorker } from './workers/notification.worker';
import { TransactionConfirmWorker } from './workers/transaction-confirm.worker';
import { TelegramClient } from '@/infrastructure/messaging/telegram-client';
import { NotificationService } from '@/infrastructure/messaging/notification.service';
import { UserRepository } from '@/infrastructure/database/repositories/user.repository';
import { PositionRepository } from '@/infrastructure/database/repositories/position.repository';
import { db } from '@/db';
import { GetPositionUseCase } from '@/application/position/get-position.use-case';
import { RebalancePositionUseCase } from '@/application/position/rebalance-position.use-case';
import { dexRegistry } from '@/services/dex-registry.service';
import type { Telegraf } from 'telegraf';
import type { BotContext } from '@/types/bot.types';
import { PrivyTransactionService } from '@/services/transaction.service';
import { SolanaAdapter } from '@/adapters/blockchain/solana.adapter';
import { container } from '../di/container';

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
    this.redis = new Redis(CONFIG.REDIS.URL, { maxRetriesPerRequest: null, lazyConnect: true });
    this.producerOnly = !!opts?.producerOnly;

    // Common queue options
    this.qOpts = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    } as QueueOptions;

    if (!this.producerOnly) {
      // Instantiate infrastructure dependencies
      const userRepo = new UserRepository(db);
      const positionRepo = new PositionRepository(db);

      const telegramClient = opts?.bot ? new TelegramClient(opts.bot) : undefined;
      const notificationService = new NotificationService(
        telegramClient as any,
        userRepo,
        // pass this to avoid circular dependency; will be set after instantiation
        this,
      );

      const getPositionUseCase = container.get(GetPositionUseCase); //new GetPositionUseCase(positionRepo, dexRegistry);
      const txService = new PrivyTransactionService();
      const rebalanceUseCase = new RebalancePositionUseCase(positionRepo, dexRegistry, txService);

      const solana = new SolanaAdapter();

      // Register workers
      this.registry.register(JOB_POSITION_MONITOR, new PositionMonitorWorker(getPositionUseCase, notificationService, this));
      this.registry.register(JOB_REBALANCE, new RebalanceWorker(rebalanceUseCase, notificationService));
      if (telegramClient) this.registry.register(JOB_NOTIFICATION, new NotificationWorker(notificationService));
      this.registry.register(JOB_TX_CONFIRM, new TransactionConfirmWorker(solana, positionRepo));

      // Setup queues and workers
      this.createQueueAndWorker(JOB_POSITION_MONITOR, this.qOpts, { concurrency: 5 });
      this.createQueueAndWorker(JOB_REBALANCE, this.qOpts, { concurrency: 2 });
      this.createQueueAndWorker(JOB_TX_CONFIRM, this.qOpts, { concurrency: 20 });
      if (telegramClient) this.createQueueAndWorker(JOB_NOTIFICATION, this.qOpts, { concurrency: 10 });

      logger.info('[JobQueue] initialized');
    } else {
      logger.info('[JobQueue] producer-only mode initialized');
    }
  }

  private createQueueAndWorker<N extends KnownJobNames>(name: N, qOpts: QueueOptions, w: { concurrency: number }) {
    const queue = new Queue<KnownJobDataMap[N]>(name, qOpts);
    const workerOpts: WorkerOptions = {
      connection: this.redis,
      concurrency: w.concurrency,
      maxStalledCount: 1,
      stalledInterval: 30000,
    } as WorkerOptions;

    const worker = new Worker<KnownJobDataMap[N]>(name, async (job: Job<KnownJobDataMap[N]>) => {
      const handler = this.registry.get(name);
      if (!handler) throw new Error(`No worker registered for ${name}`);
      return handler.process(job);
    }, workerOpts);

    worker.on('failed', (job, err) => logger.error({ jobId: job?.id, name }, '[JobQueue] job failed: ' + (err?.stack || err)));
    worker.on('error', (err) => logger.error({ name }, '[JobQueue] worker error: ' + (err?.stack || err)));

    this.entries.set(name, { queue, worker, concurrency: w.concurrency });
  }

  async enqueue<N extends KnownJobNames>(queueName: N, data: KnownJobDataMap[N], options?: EnqueueOptions): Promise<void> {
    let entry = this.entries.get(queueName);
    if (!entry) {
      // In producer-only mode, lazily create a queue without a worker
      const queue = new Queue<KnownJobDataMap[N]>(queueName, this.qOpts);
      entry = { queue, worker: undefined as any, concurrency: 0 } as QueueEntry<N>;
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
    for (const [name, entry] of this.entries) stats[name] = await entry.queue.getJobCounts();
    return stats;
  }

  async pauseQueues() {
    await Promise.all(Array.from(this.entries.values()).map((e) => e.queue.pause()));
  }

  async resumeQueues() {
    await Promise.all(Array.from(this.entries.values()).map((e) => e.queue.resume()));
  }

  async shutdown() {
    logger.info('[JobQueue] shutting down');
    await Promise.all(Array.from(this.entries.values()).map((e) => e.worker.close()));
    await Promise.all(Array.from(this.entries.values()).map((e) => e.queue.close()));
    await this.redis.quit();
    logger.info('[JobQueue] shutdown completed');
  }
}
