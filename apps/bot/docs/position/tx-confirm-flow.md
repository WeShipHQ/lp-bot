# Transaction Confirmation Flow

## Overview

This document describes the transaction confirmation flow for position operations (create, rebalance, close) using the job queue system and transaction parser.

## Architecture

### Components

1. **Job Queue Service** (`job-queue.service.ts`)
   - Manages BullMQ queues and workers
   - Handles job lifecycle and retries
   - Provides enhanced observability with event listeners

2. **Transaction Confirm Worker** (`transaction-confirm.worker.ts`)
   - Processes transaction confirmation jobs
   - Parses transaction data from blockchain
   - Updates database with confirmed transaction data

3. **Transaction Parser** (`tx-parser.ts`)
   - Parses Meteora DLMM instructions from transactions
   - Extracts position data, token transfers, and metadata
   - Returns structured instruction data

## Position Creation Flow

### Step 1: Transaction Submission

When a user creates a position in the Telegram bot:

1. User completes the position creation wizard
2. `CreatePositionUseCase.execute()` is called with position parameters
3. Use case builds transaction instructions via DEX adapter
4. Transaction is signed and submitted to Solana network
5. Transaction signature is obtained

### Step 2: Pending Transaction Storage

```typescript
await db.insert(pendingTransactions).values({
  signature,
  operationType: "CREATE_POSITION",
  userId: command.user.id,
  status: "PENDING",
  metadata: JSON.stringify({
    command: { /* basic command data */ },
    positionContext: {
      userId,
      walletAddress,
      dex,
      poolAddress,
      strategy,
      tokenAAmount,
      tokenBAmount,
      tokenAMint,
      tokenBMint,
      tokenASymbol,
      tokenBSymbol,
      tokenADecimals,
      tokenBDecimals,
      autoRebalance,
      slippage,
      positionAddress,
    }
  }),
  retryCount: 0,
  maxRetries: 3,
});
```

### Step 3: Job Enqueue

```typescript
await jobQueue.enqueue(
  JOB_TX_CONFIRM,
  {
    signature,
    operationType: "CREATE_POSITION",
    userId,
    positionAddress,
    submittedAt: Date.now(),
  },
  { delay: 500 } // 500ms delay before first attempt
);
```

### Step 4: Job Processing

The `TransactionConfirmWorker` processes the job:

1. **Check Transaction Status**
   ```typescript
   const status = await this.solana.getSignatureStatus(signature);
   ```

2. **Handle Pending/Timeout**
   - If no status: retry with exponential backoff
   - If timeout (>5 minutes): mark as FAILED
   - If error: mark as FAILED

3. **Handle Confirmation**
   - Update pending transaction status to COMPLETED
   - Call operation-specific handler

### Step 5: Parse Transaction (handleCreatePosition)

Instead of fetching on-chain data, we parse the transaction:

```typescript
// Get parsed transaction from Solana
const connection = this.solana.getConnection();
const parsedTransaction = await connection.getParsedTransaction(signature, {
  maxSupportedTransactionVersion: 0,
});

// Parse Meteora instructions
const instructions = parseMeteoraInstructions(parsedTransaction);

// Find position creation instructions
const initializeInstruction = instructions.find(ix => ix.instructionType === "open");
const addLiquidityInstruction = instructions.find(ix => ix.instructionType === "add");
```

### Step 6: Extract Position Data

```typescript
// Extract position address from instructions
const effectivePositionAddress = 
  positionAddress ?? 
  initializeInstruction.accounts.position ?? 
  context.positionAddress;

// Extract actual token amounts from token transfers
const tokenATransfer = addLiquidityInstruction.tokenTransfers.find(
  t => t.mint === context.tokenAMint
);
const tokenBTransfer = addLiquidityInstruction.tokenTransfers.find(
  t => t.mint === context.tokenBMint
);

const actualTokenAAmount = (tokenATransfer.amount / Math.pow(10, context.tokenADecimals)).toString();
const actualTokenBAmount = (tokenBTransfer.amount / Math.pow(10, context.tokenBDecimals)).toString();
```

### Step 7: Persist Position

```typescript
// Fetch current token prices
const priceData = await this.priceService.getPrices([
  context.tokenAMint,
  context.tokenBMint,
  solMint,
]);

// Create position in database
const positionId = await positionPersistenceService.createPosition({
  signature,
  positionAddress: effectivePositionAddress,
  context,
  onChainData: {
    actualTokenAAmount,
    actualTokenBAmount,
  },
  prices: {
    tokenAUsd: priceData[context.tokenAMint]?.price ?? 0,
    tokenBUsd: priceData[context.tokenBMint]?.price ?? 0,
    solUsd: priceData[solMint]?.price ?? 0,
  },
});
```

### Step 8: Post-Creation Actions

```typescript
// Invalidate portfolio cache
await this.cache.invalidate(CachePatterns.portfolioPattern(userId));

// Schedule position monitoring (if auto-rebalance enabled)
if (context.autoRebalance) {
  await jobQueue.enqueue(JOB_POSITION_MONITOR, {
    userId,
    positionId,
  }, {
    repeat: { every: 60 * 60 * 1000 }, // Every hour
  });
}

// Send notification
await jobQueue.enqueue(JOB_NOTIFICATION, {
  userId,
  notification: {
    type: "general",
    title: "Position Created",
    message: "Your position has been successfully created!",
  },
});
```

## Job Queue Enhancements

### Enhanced Event Listeners

The job queue now includes comprehensive event listeners for better observability:

- **completed**: Logs job completion with duration
- **failed**: Logs detailed failure information (attempts, data, error)
- **error**: Logs worker-level errors
- **stalled**: Logs stalled jobs for investigation
- **active**: Logs job start (debug level)

### New Utility Methods

1. **getJob()**: Retrieve a specific job by ID
2. **getJobState()**: Get the current state of a job
3. **retryFailedJobs()**: Retry failed jobs in a queue
4. **cleanQueue()**: Clean up old completed/failed jobs
5. **shutdown()**: Graceful shutdown with timeout

## Benefits of Transaction Parsing Approach

### Advantages

1. **No On-Chain Data Dependency**: Don't need to wait for state to propagate
2. **Immediate Data**: Transaction data is available as soon as confirmed
3. **More Reliable**: Less prone to RPC issues or account fetch failures
4. **Cost Effective**: Fewer RPC calls
5. **Complete Data**: Transaction includes all actual amounts and transfers
6. **Reusable**: Same parser can be used for rebalance, claim, close operations

### Data Available from Parser

The `MeteoraDlmmInstruction` type provides:

- `instructionName`: Specific instruction (e.g., "initialize_position", "add_liquidity_by_strategy2")
- `instructionType`: Operation type ("open", "add", "remove", "claim", "close")
- `accounts`: Position, LB pair, sender, token mints, token accounts
- `tokenTransfers`: Array of actual token transfers with mint and amount
- `activeBinId`: Active bin at time of operation
- `signature`, `slot`, `blockTime`: Transaction metadata

## Error Handling

### Retry Strategy

- **Default**: 3 attempts with exponential backoff (2 seconds base)
- **Timeout**: 5 minutes from transaction submission
- **Failed**: Marked as FAILED in pending transactions table

### Logging

All operations include comprehensive logging:
- Info: Normal flow progression
- Warn: Recoverable issues (e.g., missing optional data)
- Error: Critical failures with full context
- Debug: Detailed operational data

## Future Enhancements

1. **Metrics Collection**: Track job processing times, failure rates
2. **Alerting**: Notify on high failure rates or stalled jobs
3. **Job Priority**: Support priority levels for different operations
4. **Result Storage**: Store job results for audit trail
5. **Dashboard**: Real-time view of queue health and job status
