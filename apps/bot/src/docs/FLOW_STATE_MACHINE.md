# Flow State Machine Documentation

## Overview

The Flow State Machine system provides robust, resumable, and idempotent transaction flows for CREATE, CLAIM, CLOSE, and REBALANCE operations. Each flow moves through explicit states with checkpoints, enabling recovery from failures and preventing duplicate on-chain transactions.

## Architecture

### Core Components

1. **Flow State Machine** (`src/services/flows/flow-state-machine.ts`)
   - Manages state transitions
   - Persists checkpoints to database
   - Handles retries and failure compensation

2. **Flow Definitions** (`src/services/flows/*-flow.ts`)
   - CREATE_POSITION
   - CLAIM_FEES
   - CLOSE_POSITION
   - REBALANCE

3. **Flow Workers**
   - `FlowRunnerWorker`: Orchestrates flow execution
   - `FlowCleanupWorker`: Detects and cleans up stale flows
   - `FlowRecoveryWorker`: Attempts to resume failed flows

4. **Flow Repository** (`src/services/flows/flow-state-machine.ts`)
   - Persists flow state to `pending_transactions` table
   - Provides idempotency via unique keys

## States and Transitions

### CREATE_POSITION Flow States

```
INITIATED
  → VALIDATING (validate inputs)
  → BUILDING_TX (build transaction)
  → TX_SUBMITTED (submit to blockchain)
  → TX_CONFIRMING (wait for confirmation)
  → TX_CONFIRMED (confirmed on-chain)
  → PERSISTING (save to database)
  → COMPLETED
```

### CLAIM_FEES Flow States

```
INITIATED
  → VALIDATING
  → BUILDING_TX
  → TX_SUBMITTED
  → TX_CONFIRMING
  → TX_CONFIRMED
  → SWAP_PENDING (if auto-convert enabled)
  → SWAP_CONFIRMED
  → PERSISTING
  → COMPLETED
```

### CLOSE_POSITION Flow States

```
INITIATED
  → VALIDATING
  → BUILDING_TX
  → TX_SUBMITTED
  → TX_CONFIRMING
  → TX_CONFIRMED
  → SWAP_PENDING (if auto-convert enabled)
  → SWAP_CONFIRMED
  → PERSISTING
  → COMPLETED
```

### REBALANCE Flow States

```
INITIATED
  → VALIDATING
  → CLOSING_OLD_POSITION
  → OLD_POSITION_CLOSED
  → CLAIMING_FEES
  → FEES_CLAIMED
  → CREATING_NEW_POSITION
  → NEW_POSITION_CREATED
  → PERSISTING
  → COMPLETED
```

## Idempotency

Each flow is assigned a unique idempotency key based on:
- `userId`
- `flowType`
- `intent` (operation-specific identifier)

```typescript
const idempotencyKey = `${flowType}:${userId}:${intent}`;
```

**Examples:**
- `CREATE_POSITION:user-123:pool-abc`
- `CLAIM_FEES:user-123:position-xyz`
- `CLOSE_POSITION:user-123:position-xyz`

If a flow with the same idempotency key is already in progress, the system will resume the existing flow rather than creating a new one.

## Checkpoint Data

Each flow type stores specific checkpoint data for recovery:

### CREATE_POSITION Checkpoint
```typescript
{
  poolAddress: string;
  dex: string;
  tokenA: Token;
  tokenB: Token;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  positionAddress?: string;
  swapGroup?: string;
  swap1Signature?: string;
  swap2Signature?: string;
}
```

### CLAIM_FEES Checkpoint
```typescript
{
  positionId: string;
  positionAddress: string;
  autoConvertToSol: boolean;
  claimedTokenAAmount?: string;
  claimedTokenBAmount?: string;
  swapGroup?: string;
}
```

## Usage Examples

### Starting a CREATE_POSITION Flow

```typescript
import { startCreatePositionFlow } from "@/services/flows";

const machine = await startCreatePositionFlow({
  userId: "user-123",
  walletAddress: "Sol1x...xyz",
  walletId: "wallet-abc",
  poolAddress: "pool-xyz",
  dex: "meteora",
  tokenA: { address: "mint-a", decimals: 9 },
  tokenB: { address: "mint-b", decimals: 6 },
  tokenAAmount: "10",
  tokenBAmount: "100",
  strategy: "spot",
});

// Execute first step
const result = await machine.run();

if (result.success) {
  console.log("Flow step completed", result.state);
}
```

### Resuming a Flow

```typescript
import { FlowService, FlowRepository } from "@/services/flows";

const repository = new FlowRepository();
const service = new FlowService(repository);

// Resume existing flow
const machine = await service.resumeFlow(
  createPositionFlowDefinition,
  flowId
);

const result = await machine.run();
```

### Triggering External Events

```typescript
import { FlowService, FlowEvent } from "@/services/flows";

const service = new FlowService();

// Trigger TX_CONFIRMED event after blockchain confirmation
await service.trigger(flowId, FlowEvent.TX_CONFIRMED, {
  signature: "tx-signature",
});
```

## Monitoring and Cleanup

### Automatic Cleanup

The `FlowCleanupWorker` runs periodically (default: every 5 minutes) to:
1. Detect flows exceeding timeout thresholds (default: 10 minutes)
2. Attempt recovery for recoverable states
3. Mark as FAILED and notify users for unrecoverable states

### Manual Recovery

```typescript
import { JobQueueService, JOB_FLOW_RECOVERY } from "@/infrastructure/jobs";

const jobQueue = new JobQueueService({ producerOnly: true });

await jobQueue.enqueue(JOB_FLOW_RECOVERY, {
  flowId: "flow-123",
  strategy: "retry", // or "compensate" or "manual"
});
```

### Admin Tooling

Query flow state for debugging:

```sql
SELECT
  id,
  flow_type,
  flow_state,
  flow_status,
  flow_checkpoint,
  flow_started_at,
  flow_last_transition_at,
  flow_expires_at
FROM pending_transactions
WHERE user_id = 'user-123'
  AND flow_status NOT IN ('COMPLETED', 'FAILED')
ORDER BY flow_started_at DESC;
```

## Error Handling

### Retry Strategy

- Each flow has a configurable `maxRetries` (default: 3)
- Failed steps increment `retryCount` in checkpoint
- Exponential backoff between retries (2s, 4s, 8s)
- After max retries, flow marked as FAILED

### Compensation

Some flows support compensation routines:
- Rollback partial database changes
- Refund gas fees (where applicable)
- Notify user of failed operation

Compensation is triggered when:
- Flow fails after critical on-chain step
- Manual recovery requested with `strategy: "compensate"`

## Database Schema

The `pending_transactions` table tracks flow state:

```sql
ALTER TABLE pending_transactions ADD COLUMN
  idempotency_key text UNIQUE,
  flow_state text NOT NULL DEFAULT 'INITIATED',
  flow_status text NOT NULL DEFAULT 'PENDING',
  flow_checkpoint jsonb,
  flow_started_at timestamptz,
  flow_last_transition_at timestamptz,
  flow_completed_at timestamptz,
  flow_expires_at timestamptz,
  flow_timeout_ms integer;
```

## Testing

### Unit Tests

Test state transitions without blockchain interaction:

```typescript
describe("FlowStateMachine", () => {
  it("should transition through states", async () => {
    const machine = await startCreatePositionFlow(params);
    
    let result = await machine.run();
    expect(result.state).toBe(CreatePositionState.VALIDATING);
    
    result = await machine.run();
    expect(result.state).toBe(CreatePositionState.BUILDING_TX);
  });
});
```

### Integration Tests

Test with mocked blockchain:

```typescript
describe("CreatePositionFlow", () => {
  it("should handle transaction confirmation", async () => {
    const machine = await startCreatePositionFlow(params);
    
    await machine.run(); // VALIDATING
    await machine.run(); // BUILDING_TX
    await machine.run(); // TX_SUBMITTED
    
    // Mock blockchain confirmation
    await machine.trigger(FlowEvent.TX_CONFIRMED, {
      signature: "mock-signature",
    });
    
    const flow = await repository.findById(machine.flowId);
    expect(flow.currentState).toBe(CreatePositionState.TX_CONFIRMED);
  });
});
```

## Best Practices

1. **Always use idempotency keys** to prevent duplicate operations
2. **Store all operation context** in checkpoint data for recovery
3. **Keep state transitions small** to enable frequent checkpointing
4. **Handle external dependencies** (blockchain, swaps) with async waiting states
5. **Log state transitions** for debugging and monitoring
6. **Set realistic timeouts** based on operation complexity
7. **Test recovery paths** as thoroughly as happy paths

## Troubleshooting

### Flow Stuck in WAITING State

Check if external event was triggered:
- For `TX_CONFIRMING`: Check if TransactionConfirmWorker ran
- For `SWAP_PENDING`: Check if SwapExecutionWorker completed

### Flow Marked as FAILED

1. Check `error_message` and `flow_checkpoint.errors`
2. Review logs for the flowId
3. Determine if retry or manual intervention needed
4. Use recovery worker if appropriate

### Duplicate Transactions

If duplicate on-chain transactions detected:
1. Verify idempotency key is generated correctly
2. Check for race conditions in flow initiation
3. Review transaction submission code for proper deduplication

## Migration Guide

### From Legacy Code

Replace direct transaction submission:

**Before:**
```typescript
const signature = await submitTransaction(tx);
await db.insert(pendingTransactions).values({ signature, ... });
```

**After:**
```typescript
const machine = await startCreatePositionFlow(params);
await machine.run(); // Executes with full state tracking
```

### Existing Pending Transactions

Run migration to backfill flow fields:

```sql
UPDATE pending_transactions
SET
  flow_state = 'INITIATED',
  flow_status = CASE
    WHEN status = 'COMPLETED' THEN 'COMPLETED'
    WHEN status = 'FAILED' THEN 'FAILED'
    ELSE 'PENDING'
  END,
  flow_started_at = created_at,
  flow_last_transition_at = updated_at
WHERE flow_state IS NULL;
```

## Future Enhancements

- [ ] Add visual flow debugger UI
- [ ] Implement more granular compensation routines
- [ ] Add flow metrics and analytics dashboard
- [ ] Support parallel sub-flows (e.g., simultaneous swaps)
- [ ] Add flow templates for custom operations
- [ ] Implement flow versioning for schema changes
