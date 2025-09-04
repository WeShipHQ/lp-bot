import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { RebalanceService } from './rebalance.service';
import { PriceMonitoringService } from './price-monitoring.service';
import { db } from '../db';
import { positions, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';

// Job Types
export interface PositionMonitorJobData {
  userId: string;
  positionId?: string;
}

export interface PriceAlertJobData {
  tokenAddress: string;
  threshold: number;
  direction: 'up' | 'down';
}

export interface RebalanceJobData {
  positionId: string;
  userId: string;
  strategy: 'STANDARD' | 'DIP_PROTECTION';
  reason: string;
}

export class JobQueueService {
  private redis: Redis;
  private positionMonitorQueue: Queue<PositionMonitorJobData>;
  private priceAlertQueue: Queue<PriceAlertJobData>;
  private rebalanceQueue: Queue<RebalanceJobData>;
  private positionMonitorWorker: Worker<PositionMonitorJobData>;
  private priceAlertWorker: Worker<PriceAlertJobData>;
  private rebalanceWorker: Worker<RebalanceJobData>;
  
  private rebalanceService: RebalanceService;
  private priceMonitoringService: PriceMonitoringService;

  constructor() {
    // Redis connection
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true,
    });

    const queueOptions: QueueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    };

    // Initialize queues
    this.positionMonitorQueue = new Queue('position-monitor', queueOptions);
    this.priceAlertQueue = new Queue('price-alert', queueOptions);
    this.rebalanceQueue = new Queue('rebalance', queueOptions);

    // Initialize services
    this.rebalanceService = new RebalanceService();
    this.priceMonitoringService = new PriceMonitoringService();

    // Initialize workers
    this.initializeWorkers();
  }

  private initializeWorkers() {
    const workerOptions: WorkerOptions = {
      connection: this.redis,
      concurrency: 5,
      maxStalledCount: 1,
      stalledInterval: 30000,
    };

    // Position Monitor Worker
    this.positionMonitorWorker = new Worker<PositionMonitorJobData>(
      'position-monitor',
      async (job: Job<PositionMonitorJobData>) => {
        return this.processPositionMonitorJob(job);
      },
      workerOptions
    );

    // Price Alert Worker
    this.priceAlertWorker = new Worker<PriceAlertJobData>(
      'price-alert',
      async (job: Job<PriceAlertJobData>) => {
        return this.processPriceAlertJob(job);
      },
      workerOptions
    );

    // Rebalance Worker
    this.rebalanceWorker = new Worker<RebalanceJobData>(
      'rebalance',
      async (job: Job<RebalanceJobData>) => {
        return this.processRebalanceJob(job);
      },
      { ...workerOptions, concurrency: 2 } // Lower concurrency for rebalancing
    );

    // Error handling
    [this.positionMonitorWorker, this.priceAlertWorker, this.rebalanceWorker].forEach(worker => {
      worker.on('failed', (job, err) => {
        logger.error(`Job ${job?.id} failed:`, err);
      });

      worker.on('error', (err) => {
        logger.error('Worker error:', err);
      });
    });
  }

  // Job Processors
  private async processPositionMonitorJob(job: Job<PositionMonitorJobData>) {
    const { userId, positionId } = job.data;
    
    try {
      logger.info(`Processing position monitor job for user ${userId}`);
      
      // Get user's auto-rebalance settings
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user?.autoRebalanceEnabled) {
        return { skipped: true, reason: 'Auto-rebalance disabled' };
      }

      // Get positions to monitor
      const positionsToCheck = positionId 
        ? await db.query.positions.findMany({
            where: and(
              eq(positions.userId, userId),
              eq(positions.id, positionId)
            ),
          })
        : await db.query.positions.findMany({
            where: eq(positions.userId, userId),
          });

      const results = [];
      
      for (const position of positionsToCheck) {
        const analysis = await this.rebalanceService.analyzePosition(position.id);
        
        if (analysis.needsRebalance) {
          // Queue rebalance job
          await this.queueRebalanceJob({
            positionId: position.id,
            userId: userId,
            strategy: user.rebalanceStrategy || 'STANDARD',
            reason: analysis.reason || 'Position analysis triggered rebalance'
          });
          
          results.push({
            positionId: position.id,
            action: 'rebalance_queued',
            reason: analysis.reason
          });
        } else {
          results.push({
            positionId: position.id,
            action: 'no_action_needed',
            health: analysis.currentHealth
          });
        }
      }

      return { processed: results.length, results };
    } catch (error) {
      logger.error(`Position monitor job failed for user ${userId}:`, error);
      throw error;
    }
  }

  private async processPriceAlertJob(job: Job<PriceAlertJobData>) {
    const { tokenAddress, threshold, direction } = job.data;
    
    try {
      logger.info(`Processing price alert job for token ${tokenAddress}`);
      
      const currentPrice = await this.priceMonitoringService.getCurrentPrice(tokenAddress);
      
      if (!currentPrice) {
        throw new Error(`Could not fetch price for token ${tokenAddress}`);
      }

      const alertTriggered = direction === 'up' 
        ? currentPrice.price >= threshold
        : currentPrice.price <= threshold;

      if (alertTriggered) {
        // Find positions affected by this price change
        const affectedPositions = await this.priceMonitoringService.getPositionsForToken(tokenAddress);
        
        for (const position of affectedPositions) {
          await this.queuePositionMonitorJob({
            userId: position.userId,
            positionId: position.id
          });
        }

        return {
          triggered: true,
          currentPrice: currentPrice.price,
          threshold,
          direction,
          affectedPositions: affectedPositions.length
        };
      }

      return {
        triggered: false,
        currentPrice: currentPrice.price,
        threshold,
        direction
      };
    } catch (error) {
      logger.error(`Price alert job failed for token ${tokenAddress}:`, error);
      throw error;
    }
  }

  private async processRebalanceJob(job: Job<RebalanceJobData>) {
    const { positionId, userId, strategy, reason } = job.data;
    
    try {
      logger.info(`Processing rebalance job for position ${positionId}`);
      
      const result = await this.rebalanceService.executeRebalance(positionId, strategy);
      
      if (result.success) {
        logger.info(`Rebalance completed for position ${positionId}:`, result);
        return {
          success: true,
          transactionId: result.transactionId,
          reason,
          strategy
        };
      } else {
        throw new Error(result.error || 'Rebalance failed');
      }
    } catch (error) {
      logger.error(`Rebalance job failed for position ${positionId}:`, error);
      throw error;
    }
  }

  // Public Methods to Queue Jobs
  async queuePositionMonitorJob(data: PositionMonitorJobData, delay?: number) {
    return this.positionMonitorQueue.add('monitor-position', data, {
      delay,
      jobId: `monitor-${data.userId}-${data.positionId || 'all'}-${Date.now()}`
    });
  }

  async queuePriceAlertJob(data: PriceAlertJobData, delay?: number) {
    return this.priceAlertQueue.add('price-alert', data, {
      delay,
      jobId: `alert-${data.tokenAddress}-${data.direction}-${Date.now()}`
    });
  }

  async queueRebalanceJob(data: RebalanceJobData, delay?: number) {
    return this.rebalanceQueue.add('rebalance', data, {
      delay,
      priority: 10, // High priority for rebalancing
      jobId: `rebalance-${data.positionId}-${Date.now()}`
    });
  }

  // Scheduled Jobs
  async setupScheduledJobs() {
    // Monitor all positions every 5 minutes
    await this.positionMonitorQueue.add(
      'scheduled-monitor-all',
      { userId: 'all' },
      {
        repeat: { pattern: '*/5 * * * *' }, // Every 5 minutes
        jobId: 'scheduled-monitor-all'
      }
    );

    // Price monitoring every minute
    await this.priceAlertQueue.add(
      'scheduled-price-check',
      { tokenAddress: 'all', threshold: 0, direction: 'up' },
      {
        repeat: { pattern: '* * * * *' }, // Every minute
        jobId: 'scheduled-price-check'
      }
    );

    logger.info('Scheduled jobs setup completed');
  }

  // Queue Management
  async getQueueStats() {
    const [positionStats, priceStats, rebalanceStats] = await Promise.all([
      this.positionMonitorQueue.getJobCounts(),
      this.priceAlertQueue.getJobCounts(),
      this.rebalanceQueue.getJobCounts()
    ]);

    return {
      positionMonitor: positionStats,
      priceAlert: priceStats,
      rebalance: rebalanceStats
    };
  }

  async pauseQueues() {
    await Promise.all([
      this.positionMonitorQueue.pause(),
      this.priceAlertQueue.pause(),
      this.rebalanceQueue.pause()
    ]);
    logger.info('All queues paused');
  }

  async resumeQueues() {
    await Promise.all([
      this.positionMonitorQueue.resume(),
      this.priceAlertQueue.resume(),
      this.rebalanceQueue.resume()
    ]);
    logger.info('All queues resumed');
  }

  async shutdown() {
    logger.info('Shutting down job queue service...');
    
    await Promise.all([
      this.positionMonitorWorker.close(),
      this.priceAlertWorker.close(),
      this.rebalanceWorker.close()
    ]);

    await Promise.all([
      this.positionMonitorQueue.close(),
      this.priceAlertQueue.close(),
      this.rebalanceQueue.close()
    ]);

    await this.redis.quit();
    logger.info('Job queue service shutdown completed');
  }
}

// Singleton instance
export const jobQueueService = new JobQueueService();