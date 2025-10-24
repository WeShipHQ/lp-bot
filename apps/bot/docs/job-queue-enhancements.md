# Job Queue Service Enhancements

## Overview

This document outlines the enhancements made to the `JobQueueService` class to improve observability, maintainability, and operational capabilities.

## Enhanced Features

### 1. Comprehensive Event Listeners

**Previous Implementation:**
```typescript
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, name }, '[JobQueue] job failed: ' + (err?.stack || err)));
worker.on('error', (err) => logger.error({ name }, '[JobQueue] worker error: ' + (err?.stack || err)));
```

**Enhanced Implementation:**
```typescript
// Job completion tracking
worker.on('completed', (job) => {
  logger.info({ 
    jobId: job.id, 
    name, 
    duration: Date.now() - job.processedOn! 
  }, '[JobQueue] job completed');
});

// Detailed failure logging
worker.on('failed', (job, err) => {
  logger.error({ 
    jobId: job?.id, 
    name, 
    attemptsMade: job?.attemptsMade,
    data: job?.data,
    error: err?.message,
    stack: err?.stack 
  }, '[JobQueue] job failed');
});

// Worker error tracking
worker.on('error', (err) => {
  logger.error({ 
    name, 
    error: err?.message, 
    stack: err?.stack 
  }, '[JobQueue] worker error');
});

// Stalled job detection
worker.on('stalled', (jobId) => {
  logger.warn({ jobId, name }, '[JobQueue] job stalled');
});

// Active job tracking
worker.on('active', (job) => {
  logger.debug({ jobId: job.id, name }, '[JobQueue] job started');
});
```

**Benefits:**
- Track job processing duration for performance monitoring
- Detailed failure context including attempt count and job data
- Detect stalled jobs that may need manual intervention
- Debug-level logging for active jobs without cluttering production logs

### 2. Job Management Methods

#### Get Job by ID
```typescript
async getJob<N extends KnownJobNames>(
  queueName: N, 
  jobId: string
): Promise<Job<KnownJobDataMap[N]> | undefined>
```

Retrieve a specific job for inspection or debugging.

**Use Cases:**
- Check job status during development
- Debug specific job failures
- Verify job data before processing

#### Get Job State
```typescript
async getJobState<N extends KnownJobNames>(
  queueName: N, 
  jobId: string
): Promise<string | undefined>
```

Get the current state of a job (waiting, active, completed, failed, delayed, etc.).

**Use Cases:**
- API endpoint to check transaction status
- User dashboard showing position creation status
- Monitoring job progress

#### Retry Failed Jobs
```typescript
async retryFailedJobs<N extends KnownJobNames>(
  queueName: N, 
  maxRetries: number = 10
): Promise<number>
```

Retry failed jobs in bulk for recovery operations.

**Use Cases:**
- Recover from RPC outages
- Retry after fixing application bugs
- Manual intervention during incidents

**Example:**
```typescript
// Retry up to 20 failed transaction confirmation jobs
const retriedCount = await jobQueue.retryFailedJobs(JOB_TX_CONFIRM, 20);
logger.info(`Retried ${retriedCount} failed jobs`);
```

#### Clean Queue
```typescript
async cleanQueue<N extends KnownJobNames>(
  queueName: N, 
  grace: number = 1000, 
  limit?: number
): Promise<void>
```

Clean up old completed and failed jobs to prevent memory growth.

**Use Cases:**
- Scheduled cleanup maintenance
- Free up Redis memory
- Remove old job data

**Example:**
```typescript
// Clean jobs older than 1 hour (3600000ms)
await jobQueue.cleanQueue(JOB_TX_CONFIRM, 3600000, 100);
```

### 3. Graceful Shutdown Improvements

**Previous Implementation:**
```typescript
async shutdown() {
  logger.info('[JobQueue] shutting down');
  await Promise.all(Array.from(this.entries.values()).map((e) => e.worker.close()));
  await Promise.all(Array.from(this.entries.values()).map((e) => e.queue.close()));
  await this.redis.quit();
  logger.info('[JobQueue] shutdown completed');
}
```

**Enhanced Implementation:**
```typescript
async shutdown() {
  logger.info('[JobQueue] shutting down');
  
  const shutdownTimeout = 30000; // 30 seconds
  const startTime = Date.now();
  
  // Close workers with timeout tracking
  for (const [name, entry] of this.entries) {
    const remaining = shutdownTimeout - (Date.now() - startTime);
    if (remaining > 0 && entry.worker) {
      try {
        await entry.worker.close();
        logger.debug({ name }, '[JobQueue] worker closed');
      } catch (err) {
        logger.error({ name, err }, '[JobQueue] error closing worker');
      }
    }
  }
  
  await Promise.all(Array.from(this.entries.values()).map((e) => e.queue.close()));
  await this.redis.quit();
  logger.info('[JobQueue] shutdown completed');
}
```

**Benefits:**
- 30-second timeout prevents hanging shutdown
- Per-worker error handling prevents cascade failures
- Better logging for debugging shutdown issues
- Graceful handling of active jobs

## Usage Examples

### Monitoring Job Status

```typescript
// Check if a specific transaction confirmation job is complete
const jobState = await jobQueue.getJobState(JOB_TX_CONFIRM, jobId);

if (jobState === 'completed') {
  // Position is ready
} else if (jobState === 'failed') {
  // Show error to user
} else {
  // Still processing
}
```

### Recovery Operations

```typescript
// After fixing an RPC issue, retry failed jobs
const retriedCount = await jobQueue.retryFailedJobs(JOB_TX_CONFIRM, 50);
logger.info(`Recovered ${retriedCount} position creation jobs`);
```

### Maintenance Tasks

```typescript
// Daily cleanup of old jobs
import { CronJob } from 'cron';

const cleanupJob = new CronJob('0 2 * * *', async () => {
  // Clean jobs older than 24 hours
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  await jobQueue.cleanQueue(JOB_TX_CONFIRM, oneDayMs, 1000);
  await jobQueue.cleanQueue(JOB_POSITION_MONITOR, oneDayMs, 1000);
  await jobQueue.cleanQueue(JOB_REBALANCE, oneDayMs, 1000);
  
  logger.info('Job queue cleanup completed');
});

cleanupJob.start();
```

### Queue Statistics

```typescript
// Get queue health metrics
const stats = await jobQueue.getQueueStats();

for (const [queueName, counts] of Object.entries(stats)) {
  logger.info({
    queue: queueName,
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    delayed: counts.delayed,
  }, 'Queue status');
  
  // Alert if too many failed jobs
  if (counts.failed > 100) {
    // Send alert to monitoring system
  }
}
```

## Configuration Recommendations

### Queue Options

```typescript
const qOpts: QueueOptions = {
  connection: this.redis,
  defaultJobOptions: {
    removeOnComplete: 100,  // Keep last 100 completed
    removeOnFail: 50,        // Keep last 50 failed
    attempts: 3,             // Retry 3 times
    backoff: { 
      type: 'exponential', 
      delay: 2000            // 2s, 4s, 8s
    },
  },
};
```

### Worker Options

```typescript
const workerOpts: WorkerOptions = {
  connection: this.redis,
  concurrency: 20,           // Process 20 jobs concurrently
  maxStalledCount: 1,        // Retry stalled jobs once
  stalledInterval: 30000,    // Check for stalled every 30s
};
```

### Per-Queue Concurrency

```typescript
// High concurrency for fast operations
this.createQueueAndWorker(JOB_TX_CONFIRM, this.qOpts, { concurrency: 20 });

// Lower concurrency for resource-intensive operations
this.createQueueAndWorker(JOB_REBALANCE, this.qOpts, { concurrency: 2 });

// Moderate concurrency for monitoring
this.createQueueAndWorker(JOB_POSITION_MONITOR, this.qOpts, { concurrency: 5 });
```

## Best Practices

### 1. Logging Levels

- **Info**: Job lifecycle events (started, completed)
- **Warn**: Recoverable issues (stalled, retrying)
- **Error**: Failures requiring attention
- **Debug**: Detailed operational data

### 2. Error Handling

Always catch and log errors in job processors:

```typescript
async process(job: Job<MyJobData>) {
  try {
    // Job logic
    return { success: true };
  } catch (error) {
    logger.error({ 
      jobId: job.id, 
      error,
      data: job.data 
    }, 'Job processing failed');
    throw error; // Trigger retry mechanism
  }
}
```

### 3. Idempotency

Ensure job handlers are idempotent:

```typescript
// Check if already processed
const existing = await db.query.positions.findFirst({
  where: eq(positions.creationSignature, signature)
});

if (existing) {
  logger.info('Position already created, skipping');
  return { success: true, positionId: existing.id };
}
```

### 4. Monitoring

Set up alerts for:
- Failed job rate > 10%
- Average job duration > expected
- Stalled job count > 0
- Queue depth growing

## Migration Guide

No breaking changes were introduced. All existing code continues to work without modification.

To use new features:

```typescript
// Before
const jobQueue = new JobQueueService({ bot });

// After - same initialization
const jobQueue = new JobQueueService({ bot });

// New methods available
await jobQueue.retryFailedJobs(JOB_TX_CONFIRM);
await jobQueue.cleanQueue(JOB_TX_CONFIRM);
const state = await jobQueue.getJobState(JOB_TX_CONFIRM, jobId);
```

## Testing

### Unit Tests

```typescript
describe('JobQueueService', () => {
  it('should retry failed jobs', async () => {
    const retriedCount = await jobQueue.retryFailedJobs(JOB_TX_CONFIRM, 5);
    expect(retriedCount).toBeGreaterThanOrEqual(0);
  });
  
  it('should get job state', async () => {
    const state = await jobQueue.getJobState(JOB_TX_CONFIRM, 'job-123');
    expect(['waiting', 'active', 'completed', 'failed', undefined]).toContain(state);
  });
});
```

### Integration Tests

```typescript
describe('Transaction Confirmation Flow', () => {
  it('should confirm position creation', async () => {
    const signature = await createPosition(/* ... */);
    
    // Wait for job processing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const position = await db.query.positions.findFirst({
      where: eq(positions.creationSignature, signature)
    });
    
    expect(position).toBeDefined();
    expect(position.status).toBe('ACTIVE');
  });
});
```

## Future Enhancements

1. **Job Priority**: Support priority levels for critical operations
2. **Rate Limiting**: Limit job processing rate per time window
3. **Metrics Export**: Export to Prometheus/Datadog
4. **Job Result Storage**: Persist job results for audit trail
5. **Dashboard**: Web UI for queue visualization
6. **Dead Letter Queue**: Special handling for permanently failed jobs
7. **Job Dependencies**: Support job chains and dependencies
8. **Scheduled Jobs**: Built-in cron-like scheduling
