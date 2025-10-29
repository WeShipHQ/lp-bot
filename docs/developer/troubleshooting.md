# Troubleshooting Manual

## Table of Contents
- [Top 5 Failure Scenarios](#top-5-failure-scenarios)
- [Transaction Issues](#transaction-issues)
- [Flow State Machine Issues](#flow-state-machine-issues)
- [Position Management Issues](#position-management-issues)
- [Integration Issues](#integration-issues)
- [Performance Issues](#performance-issues)
- [Database Issues](#database-issues)
- [Queue Management Issues](#queue-management-issues)
- [Diagnostic Tools](#diagnostic-tools)

## Top 5 Failure Scenarios

### 1. Transaction Stuck in PENDING State

**Symptoms:**
- User's transaction shows "Confirming..." for > 2 minutes
- `flow_state` remains `TX_CONFIRMING`
- No error messages in logs

**Diagnosis:**
```sql
-- Find stuck transactions
SELECT 
  id,
  idempotency_key,
  flow_state,
  flow_last_transition_at,
  flow_checkpoint->'context'->>'signature' as signature
FROM pending_transactions
WHERE flow_status = 'PROCESSING'
  AND flow_state = 'TX_CONFIRMING'
  AND flow_last_transition_at < NOW() - INTERVAL '5 minutes';
```

**Root Causes:**
1. **RPC Node Down**: Primary RPC not responding
2. **Transaction Dropped**: Network congestion, low priority fee
3. **Signature Invalid**: Transaction never submitted
4. **Worker Failure**: Transaction confirm worker crashed

**Resolution Steps:**

**Step 1: Check Transaction Status**
```typescript
import { Connection } from '@solana/web3.js';

const connection = new Connection(SOLANA_RPC_URL);
const signature = flowCheckpoint.context.signature;

try {
  const status = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true,
  });
  
  console.log('Status:', status);
  // null = not found
  // { err: null } = success
  // { err: {...} } = failed
} catch (error) {
  console.error('RPC Error:', error);
}
```

**Step 2: Manual Recovery**
```typescript
import { FlowService, FlowEvent } from '@/services/flows';

const flowService = new FlowService();

if (status && !status.value.err) {
  // Transaction succeeded, trigger event
  await flowService.trigger(flowId, FlowEvent.TX_CONFIRMED, {
    signature,
    blockHeight: status.context.slot,
  });
} else if (status && status.value.err) {
  // Transaction failed, trigger failure
  await flowService.trigger(flowId, FlowEvent.FAIL, {
    error: 'Transaction failed on-chain',
    details: status.value.err,
  });
} else {
  // Transaction not found, mark as failed
  await flowService.trigger(flowId, FlowEvent.TIMEOUT, {
    error: 'Transaction not found after 5 minutes',
  });
}
```

**Prevention:**
- Use multiple RPC endpoints with fallback
- Set appropriate priority fees
- Implement transaction re-submission logic
- Monitor FlowCleanupWorker health

---

### 2. Duplicate Position Creation

**Symptoms:**
- User has 2+ positions in same pool with same parameters
- Database shows multiple positions with similar timestamps
- User reports: "I only clicked once"

**Diagnosis:**
```sql
-- Find potential duplicates
SELECT 
  user_id,
  pool_address,
  COUNT(*) as count,
  array_agg(id ORDER BY created_at) as position_ids,
  array_agg(created_at ORDER BY created_at) as timestamps
FROM positions
WHERE status = 'ACTIVE'
GROUP BY user_id, pool_address
HAVING COUNT(*) > 1;
```

**Root Causes:**
1. **No Idempotency**: Old code without flow state machine
2. **Duplicate Submission**: Multiple clicks before response
3. **Retry Without Check**: Network error triggered retry without checking existing flow

**Resolution Steps:**

**Step 1: Verify if Duplicates**
```typescript
// Check if truly duplicates or legitimate separate positions
const positions = await db.query.positions.findMany({
  where: and(
    eq(positions.userId, userId),
    eq(positions.poolAddress, poolAddress),
    eq(positions.status, 'ACTIVE')
  ),
  orderBy: [desc(positions.createdAt)],
});

for (const pos of positions) {
  console.log({
    id: pos.id,
    createdAt: pos.createdAt,
    tokenAAmount: pos.tokenAAmount,
    tokenBAmount: pos.tokenBAmount,
    strategyType: pos.strategyType,
  });
}
```

**Step 2: Close Duplicate (if confirmed)**
```typescript
// Close the duplicate position
import { ClosePositionUseCase } from '@/application/position/close-position.use-case';

const closeUseCase = new ClosePositionUseCase();
await closeUseCase.execute({
  userId,
  positionId: duplicatePositionId,
  walletAddress: user.walletAddress,
  walletId: user.walletId,
});
```

**Step 3: Refund User (if applicable)**
If position cannot be closed:
```typescript
// Document the issue and provide manual support
await db.insert(supportTickets).values({
  userId,
  type: 'DUPLICATE_POSITION',
  description: `Duplicate position created: ${duplicatePositionId}`,
  status: 'PENDING',
  metadata: {
    originalPositionId,
    duplicatePositionId,
    timestamp: new Date(),
  },
});
```

**Prevention:**
- ✅ Use flow state machine with idempotency keys
- ✅ Disable UI button after first click
- ✅ Check for existing flows before creating new ones

---

### 3. Fee Claim Shows Success But Tokens Not Received

**Symptoms:**
- Transaction confirmed on Solana
- User notification says "Fees claimed successfully"
- Wallet balance unchanged or partial amount received

**Diagnosis:**
```sql
-- Find the claim event
SELECT 
  ch.*,
  p.position_address,
  pt.operation_type,
  pt.tx_signature,
  pt.flow_checkpoint->'context' as context
FROM claim_history ch
JOIN positions p ON p.id = ch.position_id
LEFT JOIN pending_transactions pt ON pt.metadata->>'positionId' = ch.position_id::text
WHERE ch.user_id = 'USER_ID'
  AND ch.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ch.created_at DESC;
```

**Root Causes:**
1. **Swap Failed**: SOL conversion failed but claim succeeded
2. **Incorrect Parsing**: Transaction parsed incorrectly
3. **Token Account Missing**: User doesn't have ATA for claimed token
4. **Slippage Exceeded**: Swap attempted but failed due to slippage

**Resolution Steps:**

**Step 1: Check Transaction Details**
```bash
# View transaction on explorer
https://solscan.io/tx/{signature}

# Or fetch programmatically
solana confirm -v {signature}
```

**Step 2: Identify Failed Swap**
```sql
-- Check swap attempts
SELECT 
  id,
  operation_type,
  flow_state,
  flow_status,
  flow_checkpoint->'errors' as errors,
  tx_signature
FROM pending_transactions
WHERE metadata->>'positionId' = 'POSITION_ID'
  AND operation_type = 'SWAP'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Step 3: Manual Swap Recovery**
```typescript
import { SwapService } from '@/services/swap.service';

const swapService = new SwapService();

// Get claimed token amounts from transaction
const claimedAmounts = {
  tokenA: '1000000', // from parsed transaction
  tokenB: '2000000',
};

// Attempt swap again with higher slippage
await swapService.swapTokensToSOL({
  walletAddress: user.walletAddress,
  tokens: [
    { mint: pool.tokenA.address, amount: claimedAmounts.tokenA },
    { mint: pool.tokenB.address, amount: claimedAmounts.tokenB },
  ],
  slippageBps: 100, // 1% slippage
});
```

**Prevention:**
- Surface swap failures to users
- Provide retry button in UI
- Increase default slippage for swaps
- Allow users to keep tokens in native form

---

### 4. Auto-Rebalance Not Triggering

**Symptoms:**
- Position is out of range for > 1 hour
- User has auto-rebalance enabled
- No rebalance events recorded
- No errors in logs

**Diagnosis:**
```sql
-- Check position monitoring status
SELECT 
  p.id,
  p.position_address,
  p.is_rebalancing_enabled,
  p.price_lower,
  p.price_upper,
  p.status,
  ps.current_price,
  ps.snapshot_timestamp
FROM positions p
LEFT JOIN LATERAL (
  SELECT current_price, snapshot_timestamp
  FROM position_snapshots
  WHERE position_id = p.id
  ORDER BY snapshot_timestamp DESC
  LIMIT 1
) ps ON true
WHERE p.user_id = 'USER_ID'
  AND p.is_rebalancing_enabled = true
  AND p.status = 'ACTIVE';
```

**Root Causes:**
1. **Monitor Job Not Running**: Position monitor worker stopped
2. **Job Not Enqueued**: Position creation didn't enqueue monitor job
3. **Threshold Not Met**: Position deviation below threshold
4. **Cost Too High**: Rebalancing cost exceeds benefit
5. **User Settings Override**: Global rebalance disabled

**Resolution Steps:**

**Step 1: Check Job Queue**
```typescript
import { Queue } from 'bullmq';

const positionMonitorQueue = new Queue('position-monitor');

// Check if job exists for position
const jobs = await positionMonitorQueue.getJobs(['waiting', 'active', 'delayed']);
const positionJob = jobs.find(j => j.data.positionId === positionId);

if (!positionJob) {
  console.log('No monitor job found for position');
  
  // Re-enqueue
  await positionMonitorQueue.add('monitor', {
    positionId,
    userId,
  }, {
    repeat: {
      every: 300000, // 5 minutes
    },
  });
}
```

**Step 2: Manually Trigger Rebalance Check**
```typescript
import { PositionMonitorWorker } from '@/infrastructure/jobs/workers/position-monitor.worker';

const worker = new PositionMonitorWorker();
await worker.process({
  data: { positionId, userId },
  id: 'manual-trigger',
} as Job);
```

**Step 3: Check Rebalance Logic**
```typescript
import { RebalanceService } from '@/services/rebalance.service';

const rebalanceService = new RebalanceService();
const shouldRebalance = await rebalanceService.shouldRebalance(positionId);

console.log('Should rebalance:', shouldRebalance);
console.log('Reason:', shouldRebalance.reason);
console.log('Cost:', shouldRebalance.estimatedCost);
console.log('Deviation:', shouldRebalance.priceDeviation);
```

**Prevention:**
- Monitor job queue health
- Alert when monitor jobs stop
- Add health check endpoint
- Persist monitor job IDs in database

---

### 5. Portfolio Load Times Out

**Symptoms:**
- `/portfolio` command hangs for > 30 seconds
- User sees "Loading..." indefinitely
- Timeout error eventually returned
- Other users unaffected

**Diagnosis:**
```sql
-- Check user's position count
SELECT 
  u.id as user_id,
  u.telegram_id,
  COUNT(p.id) as position_count,
  COUNT(CASE WHEN p.status = 'ACTIVE' THEN 1 END) as active_count
FROM users u
LEFT JOIN positions p ON p.user_id = u.id
WHERE u.telegram_id = 'TELEGRAM_ID'
GROUP BY u.id;

-- Check for positions with missing data
SELECT 
  p.id,
  p.position_address,
  p.pool_address,
  p.dex,
  COUNT(ps.id) as snapshot_count
FROM positions p
LEFT JOIN position_snapshots ps ON ps.position_id = p.id
WHERE p.user_id = 'USER_ID'
  AND p.status = 'ACTIVE'
GROUP BY p.id
HAVING COUNT(ps.id) = 0;
```

**Root Causes:**
1. **Too Many Positions**: User has > 50 positions
2. **Missing Snapshots**: Positions without recent snapshots
3. **RPC Timeout**: On-chain data fetch timing out
4. **Cache Miss**: Portfolio cache expired, rebuilding
5. **Slow Query**: Database query not optimized

**Resolution Steps:**

**Step 1: Check Query Performance**
```sql
-- Enable query timing
EXPLAIN ANALYZE
SELECT 
  p.*,
  ps.*
FROM positions p
LEFT JOIN position_snapshots ps ON ps.id = (
  SELECT id FROM position_snapshots
  WHERE position_id = p.id
  ORDER BY snapshot_timestamp DESC
  LIMIT 1
)
WHERE p.user_id = 'USER_ID'
  AND p.status = 'ACTIVE';
```

**Step 2: Rebuild Portfolio Cache**
```typescript
import { CacheService } from '@/utils/cache';
import { PortfolioService } from '@/services/portfolio.service';

const cache = new CacheService();
const portfolioService = new PortfolioService();

// Invalidate stale cache
await cache.invalidate(`portfolio:${userId}`);

// Rebuild with timeout
const portfolio = await Promise.race([
  portfolioService.getPortfolio(userId),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 10000)
  ),
]);

// Cache result
await cache.set(`portfolio:${userId}`, portfolio, 300); // 5 min TTL
```

**Step 3: Paginate Positions**
```typescript
// For users with many positions, implement pagination
const POSITIONS_PER_PAGE = 10;

const paginatedPortfolio = await portfolioService.getPortfolio(userId, {
  page: 1,
  limit: POSITIONS_PER_PAGE,
  sortBy: 'value', // Show highest value positions first
});
```

**Prevention:**
- Add position count limits (e.g., max 50 active)
- Implement pagination for portfolios
- Optimize database queries with indexes
- Use read replicas for heavy queries
- Implement stale-while-revalidate caching

## Transaction Issues

### Transaction Simulation Failed

**Error Message**: `"Transaction simulation failed: {error}"`

**Common Causes & Fixes:**

| Cause | Error Pattern | Fix |
|-------|---------------|-----|
| Insufficient SOL | "insufficient funds" | Check balance, notify user |
| Invalid accounts | "invalid account data" | Verify all PDAs are correct |
| Slippage exceeded | "slippage tolerance exceeded" | Increase slippage or retry |
| Program error | "custom program error" | Parse error code, show user-friendly message |

**Debug Steps:**
```typescript
import { Connection } from '@solana/web3.js';

// Simulate transaction with detailed logs
const simulation = await connection.simulateTransaction(transaction, {
  sigVerify: false,
  replaceRecentBlockhash: true,
});

console.log('Simulation result:', {
  err: simulation.value.err,
  logs: simulation.value.logs,
  unitsConsumed: simulation.value.unitsConsumed,
});

// Parse common errors
if (simulation.value.err) {
  const errorStr = JSON.stringify(simulation.value.err);
  
  if (errorStr.includes('insufficient funds')) {
    throw new UserError('Insufficient SOL for transaction. You need at least 0.01 SOL for fees.');
  } else if (errorStr.includes('slippage')) {
    throw new TransientError('Price moved too much. Try again with higher slippage.');
  }
}
```

### Transaction Confirmation Timeout

**Error Message**: `"Transaction confirmation timeout after 60 seconds"`

**Resolution:**
```typescript
// Extend confirmation timeout
const confirmationStrategy = {
  signature,
  blockhash: recentBlockhash,
  lastValidBlockHeight: lastValidBlockHeight + 150, // Add buffer
};

const confirmation = await connection.confirmTransaction(
  confirmationStrategy,
  'confirmed' // Use 'confirmed' not 'finalized' for speed
);
```

## Flow State Machine Issues

### Flow Stuck in PROCESSING

**Query stalled flows:**
```sql
SELECT 
  id,
  idempotency_key,
  flow_state,
  flow_status,
  flow_last_transition_at,
  flow_checkpoint
FROM pending_transactions
WHERE flow_status = 'PROCESSING'
  AND flow_last_transition_at < NOW() - INTERVAL '10 minutes'
ORDER BY flow_last_transition_at ASC;
```

**Manual recovery:**
```typescript
import { FlowRecoveryWorker } from '@/infrastructure/jobs/workers/flow-recovery.worker';

const recoveryWorker = new FlowRecoveryWorker();

for (const flow of stalledFlows) {
  await recoveryWorker.process({
    data: { flowId: flow.id, strategy: 'retry' },
    id: `recovery-${flow.id}`,
  } as Job);
}
```

### Idempotency Key Collision

**Error Message**: `"Flow with idempotency key already exists"`

**Investigation:**
```sql
SELECT 
  id,
  idempotency_key,
  flow_status,
  flow_state,
  flow_started_at,
  flow_completed_at
FROM pending_transactions
WHERE idempotency_key = 'CREATE_POSITION:user123:pool_ABC'
ORDER BY flow_started_at DESC;
```

**Resolution:**
- If old flow is COMPLETED: Safe to ignore, return existing result
- If old flow is FAILED: Safe to create new flow (update logic to allow)
- If old flow is PROCESSING: Resume existing flow

## Position Management Issues

### Position Not Found On-Chain

**Symptoms**: Database has position but on-chain query returns null

**Diagnosis:**
```typescript
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(SOLANA_RPC_URL);
const positionPubkey = new PublicKey(positionAddress);

// Check if account exists
const accountInfo = await connection.getAccountInfo(positionPubkey);

if (!accountInfo) {
  console.log('Position account does not exist on-chain');
  // Possible: position was closed but DB not updated
} else {
  console.log('Account exists:', {
    owner: accountInfo.owner.toString(),
    lamports: accountInfo.lamports,
    dataLength: accountInfo.data.length,
  });
}
```

**Resolution:**
- Update database to reflect on-chain reality
- Mark position as CLOSED if account doesn't exist
- Investigate why close event wasn't captured

### P&L Calculation Mismatch

**Symptoms**: UI shows different P&L than expected

**Debug:**
```sql
-- Check calculation inputs
SELECT 
  p.id,
  p.initial_value_usd,
  ps.current_value_usd,
  ps.total_fees_claimed_usd,
  ps.unclaimed_fees_usd,
  (ps.current_value_usd + ps.total_fees_claimed_usd + ps.unclaimed_fees_usd - p.initial_value_usd) as calculated_pnl,
  p.total_pnl_usd as stored_pnl
FROM positions p
JOIN position_snapshots ps ON ps.id = (
  SELECT id FROM position_snapshots
  WHERE position_id = p.id
  ORDER BY snapshot_timestamp DESC
  LIMIT 1
)
WHERE p.id = 'POSITION_ID';
```

**Common Issues:**
- Token prices stale or incorrect
- Fees not included in calculation
- Initial value recorded incorrectly
- Snapshot data outdated

## Integration Issues

### DEX Adapter Error

**Error Message**: `"Orca adapter failed: {error}"`

**Health Check:**
```typescript
import { dexRegistry } from '@/services/dex-registry.service';

const orcaAdapter = dexRegistry.getAdapter('orca');
const isHealthy = await orcaAdapter.isHealthy();

if (!isHealthy) {
  console.log('Orca adapter unhealthy');
  
  // Check API endpoint
  const response = await fetch('https://api.orca.so/health');
  console.log('API status:', response.status);
  
  // Use fallback adapter
  const fallbackAdapter = dexRegistry.getAdapter('meteora');
}
```

### Privy Authentication Failed

**Error Message**: `"Failed to authenticate with Privy"`

**Debugging:**
```typescript
import { PrivyService } from '@/services/privy.service';

const privyService = new PrivyService();

try {
  const user = await privyService.getUser(privyUserId);
  console.log('Privy user:', user);
} catch (error) {
  if (error.status === 401) {
    console.log('Invalid or expired Privy token');
    // Re-authenticate user
  } else if (error.status === 404) {
    console.log('Privy user not found');
    // Re-link wallet
  }
}
```

## Performance Issues

### Slow Database Queries

**Identify slow queries:**
```sql
-- Enable slow query logging
ALTER DATABASE meteora_bot SET log_min_duration_statement = 1000; -- 1 second

-- View slow queries
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE mean_time > 1000
ORDER BY mean_time DESC
LIMIT 10;
```

### High Memory Usage

**Monitor memory:**
```bash
# Check Node.js memory
node --expose-gc --max-old-space-size=2048 dist/index.js

# In application
const used = process.memoryUsage();
console.log({
  rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
  heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
  heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
});
```

## Database Issues

### Migration Failed

**Rollback migration:**
```bash
pnpm db:rollback

# Or manually
psql $DATABASE_URL -c "DELETE FROM drizzle_migrations WHERE version = 'VERSION';"
```

### Connection Pool Exhausted

**Error Message**: `"Connection pool exhausted"`

**Fix:**
```typescript
// Increase pool size
const queryClient = postgres(DATABASE_URL, {
  max: 30, // Increase from default 20
  idle_timeout: 20,
  connect_timeout: 10,
});
```

## Queue Management Issues

### Jobs Not Processing

**Check queue health:**
```typescript
import { Queue } from 'bullmq';

const queue = new Queue('position-monitor');

const counts = await queue.getJobCounts();
console.log('Queue status:', counts);
// { waiting: 10, active: 2, completed: 100, failed: 5 }

const workers = await queue.getWorkers();
console.log('Active workers:', workers.length);
```

**Restart workers:**
```bash
# Via CLI
pm2 restart bot-workers

# Programmatically
await worker.close();
await worker.run();
```

## Diagnostic Tools

### Health Check Script

```typescript
// scripts/health-check.ts
import { db } from '@/db';
import { redis } from '@/utils/cache';
import { dexRegistry } from '@/services/dex-registry.service';

async function healthCheck() {
  const results = {
    database: false,
    redis: false,
    dexAdapters: {},
    queues: {},
  };
  
  // Database
  try {
    await db.execute(sql`SELECT 1`);
    results.database = true;
  } catch (error) {
    console.error('Database health check failed:', error);
  }
  
  // Redis
  try {
    await redis.ping();
    results.redis = true;
  } catch (error) {
    console.error('Redis health check failed:', error);
  }
  
  // DEX Adapters
  for (const dex of dexRegistry.list()) {
    results.dexAdapters[dex.dexType] = await dex.isHealthy();
  }
  
  console.log('Health check results:', results);
  return results;
}
```

### Flow Inspector

```typescript
// scripts/inspect-flow.ts
import { FlowRepository } from '@/services/flows/flow-state-machine';

async function inspectFlow(flowId: string) {
  const repo = new FlowRepository();
  const flow = await repo.findById(flowId);
  
  console.log('Flow Details:', {
    id: flow.id,
    idempotencyKey: flow.idempotencyKey,
    status: flow.status,
    state: flow.checkpoint.currentState,
    startedAt: flow.startedAt,
    lastTransitionAt: flow.lastTransitionAt,
    completedAt: flow.completedAt,
    retryCount: flow.checkpoint.retryCount,
    errors: flow.checkpoint.errors,
    context: flow.checkpoint.context,
  });
}
```

---

**Last Updated**: January 2025  
**Version**: 2.0

For additional support, see:
- [Monitoring Guide](./monitoring-guide.md)
- [Log Interpretation](./log-interpretation.md)
- [Queue Management](./queue-management.md)
