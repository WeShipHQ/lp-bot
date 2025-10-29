# ADR 004: Transaction Safety Guarantees & Idempotency

**Status:** Proposed  
**Date:** 2025-01-XX  
**Deciders:** Engineering Team  
**Context:** Baseline position flow audit

## Context and Problem Statement

Position lifecycle operations interact with Solana blockchain via asynchronous flows involving DEX adapters, wallet service, swap service, and background workers. Current implementation reveals several safety gaps:

- **No Explicit Idempotency Keys:** Repeat submissions can create duplicate transactions
- **Implicit Reliance on Pending Transactions:** No deduplication when workers reprocess jobs
- **Two-Phase Operations:** Rebalance flow performs close → create sequence without transactional guarantees
- **Weak Retry Strategy:** Retries may resubmit transactions without detecting partial completion
- **Inconsistent Signature Tracking:** Some flows rely on adapter-provided position addresses, others infer from instructions
- **Swap Sequencing:** SOL auto-convert path triggers sequential jobs without strict ordering guarantees
- **Manual Parsing:** TransactionConfirmWorker manually parses instructions, risk of missing edge cases

Given the PRD’s requirement for 95%+ success rate and zero lost funds, we must strengthen transaction safety and provide idempotent operations across the stack.

## Decision Drivers

- **Safety:** Prevent duplicate transactions and ensure one-time effects
- **Reliability:** Guarantee eventual consistency even with retries
- **Transparency:** Clear audit trail for all operations
- **Resilience:** Handle partial failures gracefully
- **Automation:** Enable safe auto-rebalancing and monitoring workflows

## Considered Options

### Option 1: Best-Effort Detection
Use existing pending transaction signature tracking with minimal enhancements.

**Pros:**
- Minimal changes to current implementation
- Quick incremental improvements

**Cons:**
- Fails to guarantee idempotency in multi-stage flows
- Doesn’t handle race conditions
- High risk of duplicated effects under retries

### Option 2: Distributed Sagas with Compensating Transactions
Implement saga pattern with compensating actions for multi-step flows.

**Pros:**
- Strong guarantees for multi-step workflows
- Clear compensation logic for partial failures

**Cons:**
- Significant complexity and overhead
- Requires careful design of compensating actions for blockchain operations (often impossible)

### Option 3: Idempotent Command Pattern with Transaction Coordination (SELECTED)
Introduce idempotency keys for commands, track execution state, and enforce single execution per key. Combine with explicit coordination of multi-step flows.

**Pros:**
- Strong idempotency guarantees with manageable complexity
- Works well with existing pending transactions table
- Enables safe retries and recovery
- Extensible to multi-step flows (e.g., rebalance)

**Cons:**
- Requires refactoring command execution
- Needs additional storage for idempotency keys
- Must handle eventual consistency carefully

## Decision

We will implement **Option 3: Idempotent Command Pattern with Transaction Coordination**.

### Command Idempotency Contracts

```typescript
interface IdempotentCommand<TResponse> {
  idempotencyKey: string; // Unique key per logical operation
  payload: Record<string, any>; // Normalized command data
  context: CommandContext; // userId, positionId, etc.
}

// Command execution interface
interface CommandHandler<TCommand, TResponse> {
  execute(command: TCommand): Promise<TResponse>;
}

class IdempotentCommandHandler<TCommand extends IdempotentCommand<any>, TResponse>
  implements CommandHandler<TCommand, TResponse> {
  constructor(
    private readonly handler: CommandHandler<TCommand, TResponse>,
    private readonly store: IdempotencyStore,
  ) {}
  
  async execute(command: TCommand): Promise<TResponse> {
    const { idempotencyKey, payload, context } = command;
    
    // Check if command already processed
    const existing = await this.store.get(idempotencyKey);
    if (existing?.status === 'SUCCESS') {
      return existing.response as TResponse;
    }
    if (existing?.status === 'FAILED') {
      throw new DuplicateCommandError(idempotencyKey, existing.error);
    }
    
    // Reserve key with in-progress state
    await this.store.reserve(idempotencyKey, {
      status: 'IN_PROGRESS',
      payload,
      context,
      startedAt: new Date().toISOString(),
    });
    
    try {
      const response = await this.handler.execute(command);
      await this.store.complete(idempotencyKey, {
        status: 'SUCCESS',
        response,
        completedAt: new Date().toISOString(),
      });
      return response;
    } catch (error) {
      await this.store.complete(idempotencyKey, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
```

### Idempotency Store Schema

```typescript
export const idempotencyKeys = pgTable('IdempotencyKey', {
  key: text('key').primaryKey(),
  payloadHash: text('payloadHash').notNull(),
  context: jsonb('context'),
  status: statusEnum('status').default('IN_PROGRESS'),
  response: jsonb('response'),
  error: text('error'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### Idempotency Key Generation

```typescript
import crypto from 'crypto';

function generateIdempotencyKey(commandName: string, payload: Record<string, any>) {
  const normalizedPayload = normalizePayload(payload);
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalizedPayload))
    .digest('hex');
  return `${commandName}:${hash}`;
}

function normalizePayload(payload: Record<string, any>) {
  return Object.keys(payload)
    .sort()
    .reduce((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {} as Record<string, any>);
}
```

### Flow Coordination

```typescript
class RebalanceCoordinator {
  constructor(
    private readonly closeHandler: CommandHandler<ClosePositionCommand, CloseResult>,
    private readonly createHandler: CommandHandler<CreatePositionCommand, CreateResult>,
    private readonly store: PendingRebalanceStore
  ) {}
  
  async execute(command: RebalanceCommand) {
    const sessionId = command.idempotencyKey;
    
    // Stage 1: Close existing position
    const closeKey = `${sessionId}:close`;
    await this.closeHandler.execute({
      ...command,
      idempotencyKey: closeKey,
    });
    
    await this.store.update(sessionId, {
      stage: 'CLOSED',
      closedAt: new Date().toISOString(),
    });
    
    // Stage 2: Create new position
    const createKey = `${sessionId}:create`;
    const createResult = await this.createHandler.execute({
      ...command,
      idempotencyKey: createKey,
    });
    
    await this.store.update(sessionId, {
      stage: 'CREATED',
      newPositionAddress: createResult.positionAddress,
      createdAt: new Date().toISOString(),
    });
    
    return createResult;
  }
}
```

### Transaction Submission Safety

```typescript
class SafeTransactionService {
  async submit(
    idempotencyKey: string,
    instructions: TransactionInstruction[],
    signerContext: WalletContext,
  ): Promise<string> {
    // Check if transaction already submitted
    const existing = await this.store.getTransactionByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing.signature;
    }
    
    // Simulate transaction before send
    await this.simulate(instructions);
    
    // Submit transaction
    const signature = await WalletService.signAndSendViaGateway(
      signerContext.walletId,
      signerContext.walletAddress,
      instructions,
      signerContext.additionalSigners,
    );
    
    // Record signature with idempotency key
    await this.store.recordTransaction({
      idempotencyKey,
      signature,
      status: 'SUBMITTED',
      submittedAt: new Date().toISOString(),
    });
    
    return signature;
  }
  
  async simulate(instructions: TransactionInstruction[]) {
    const solana = SolanaAdapter.getInstance();
    const simulation = await solana.simulateTransaction(instructions);
    if (simulation.err) {
      throw new TransactionSimulationError(simulation.err.toString());
    }
  }
}
```

### Pending Transaction Enhancements

```typescript
export const pendingTransactions = pgTable('PendingTransaction', {
  signature: text('signature').primaryKey(),
  idempotencyKey: text('idempotencyKey').notNull(),
  operationType: operationEnum('operationType').notNull(),
  userId: uuid('userId').notNull(),
  positionId: uuid('positionId'),
  status: statusEnum('status').default('PENDING'),
  metadata: jsonb('metadata'),
  retryCount: integer('retryCount').default(0),
  maxRetries: integer('maxRetries').default(3),
  lastAttemptAt: timestamp('lastAttemptAt'),
  nextAttemptAfter: timestamp('nextAttemptAfter'),
  errorMessage: text('errorMessage'),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
});
```

### Worker Idempotency

```typescript
class TransactionConfirmWorker {
  async process(job: Job<TransactionConfirmJobData>) {
    const { signature, operationType, idempotencyKey } = job.data;
    
    // Check if already processed
    const existing = await this.store.getConfirmationBySignature(signature);
    if (existing?.status === 'COMPLETED') {
      logger.info({ signature }, 'Confirmation already processed');
      return existing.result;
    }
    
    // Reserve confirmation processing
    await this.store.reserveConfirmation(signature, {
      idempotencyKey,
      operationType,
      status: 'PROCESSING',
      startedAt: new Date().toISOString(),
    });
    
    try {
      const result = await this.handleOperation(job.data);
      await this.store.completeConfirmation(signature, {
        status: 'COMPLETED',
        result,
        completedAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      await this.store.completeConfirmation(signature, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}
```

## Consequences

### Positive

- **Strong Idempotency Guarantees:** Prevents duplicate effects even under retries
- **Safe Retries:** Operations can be safely retried without manual intervention
- **Auditability:** Full history of command execution and outcomes
- **Recovery:** Easy to resume interrupted operations using idempotency keys
- **Consistency:** Aligns multi-step flows under one coordination pattern

### Negative

- **Implementation Complexity:** Requires refactoring all position commands
- **Storage Overhead:** Additional tables for idempotency key tracking
- **Operational Management:** Need to monitor growth of idempotency table (purge old entries)
- **Key Management:** Idempotency keys must be carefully generated to avoid collisions

### Neutral

- **Performance:** Slight overhead for pre-execution checks (acceptable)
- **UX:** No direct impact, but improved reliability enhances overall experience

## Implementation Plan

### Phase 1: Foundation (Week 1-2)
1. Create `IdempotencyStore` interface and PostgreSQL implementation
2. Add `idempotency_key` column to `pendingTransactions`
3. Update use cases to generate idempotency keys (using command payload)
4. Add `IdempotentCommandHandler` wrapper

### Phase 2: Single-Step Flows (Week 3-4)
1. Apply idempotent command pattern to ClaimFeesUseCase
2. Apply to ClosePositionUseCase
3. Update transaction confirm worker for idempotent processing

### Phase 3: Multi-Step Flows (Week 5-6)
1. Implement RebalanceCoordinator
2. Apply idempotency to RebalancePositionUseCase and underlying close/create flows
3. Enhance pending transaction metadata to include idempotency keys

### Phase 4: SOL Auto-Convert Flow (Week 7)
1. Add idempotency to swap jobs (JOB_SWAP_EXECUTION)
2. Ensure JobQueueService deduplicates jobs by idempotency key
3. Tie swap completion to pending transaction entries

### Phase 5: Simulation & Submission (Week 8)
1. Add transaction simulation before submission
2. Record simulation results in pending transaction metadata
3. Add safeguards around wallet submission (rate limits, concurrency)

### Phase 6: Monitoring & Cleanup (Week 9)
1. Add metrics for idempotency usage
2. Implement cleanup job for old idempotency records
3. Add dashboards for transaction safety (duplicate attempts, retries)

## Validation

Success criteria:
- ✅ All position commands include idempotency keys
- ✅ Repeated submissions do not create duplicate transactions
- ✅ Workers skip already processed confirmations
- ✅ Rebalance flow handles retries without double-closing or double-creating
- ✅ SOL auto-convert swaps execute exactly once per idempotency key
- ✅ Transaction simulation runs before submission

## Related Work

- ADR 001 (Error handling) – errors feed into idempotency records
- ADR 003 (State machine) – idempotency key recorded in state transitions

## References

- Stripe API Idempotency Guidelines: https://stripe.com/docs/idempotency
- AWS Architecture Blog on Idempotent APIs: https://aws.amazon.com/blogs/architecture/implementing-idempotent-APIs/
- [PRD](../PRD.md) – Non-Functional Requirements: Reliability & Security
- [System Design Document](../SystemDesign.md) – Transaction Security section
