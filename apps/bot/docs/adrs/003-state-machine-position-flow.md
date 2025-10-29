# ADR 003: State Management & State Machine Approach for Position Flows

**Status:** Proposed  
**Date:** 2025-01-XX  
**Deciders:** Engineering Team  
**Context:** Baseline position flow audit

## Context and Problem Statement

Position lifecycle flows span multiple layers and involve complex state transitions:

1. **Wizard State** (`WizardState` in scenes) – tracks user progression through multi-step dialogs
2. **Position Status** (domain model) – `ACTIVE`, `CLOSED`, `REBALANCING`
3. **Transaction Status** (`pendingTransactions.status`) – `PENDING`, `COMPLETED`, `FAILED`
4. **Rebalance Session** (`RebalanceSessionMetadata`) – multi-stage flow spanning close → create

Current implementation issues:
- **Scattered State Logic:** State transitions embedded across scenes, use cases, and workers
- **Unclear Boundaries:** No formal definition of valid state transitions
- **Error Recovery:** Hard to rollback state on failures
- **Race Conditions:** Concurrent operations could violate state invariants
- **Hard to Reason About:** Complex conditional flows with nested `if/else` and `ctx.wizard.next()`
- **Rebalance Complexity:** Two-phase commit pattern for rebalance not formalized

This makes it difficult to:
- Safely handle transaction failures
- Support idempotent retry logic
- Add new position flows (e.g., automated stop-loss)
- Visualize and reason about state transitions

## Decision Drivers

- **Safety:** Prevent invalid state transitions
- **Reliability:** Support robust error recovery
- **Maintainability:** Simplify reasoning about complex flows
- **Observability:** Clear audit trail of state transitions
- **Testability:** Deterministic testing of state logic

## Considered Options

### Option 1: Continue Ad-Hoc State Management
Keep current approach with status fields and conditional logic.

**Pros:**
- No refactoring required
- Simple for basic flows

**Cons:**
- Complex flows become unmaintainable
- Error recovery is ad-hoc and fragile
- No protection against invalid transitions
- Hard to test

### Option 2: Event Sourcing with Full Audit Log
Store all state transitions as immutable events, rebuild state by replaying events.

**Pros:**
- Complete audit history
- Perfect for debugging
- Time-travel debugging
- Strong consistency guarantees

**Cons:**
- Significant architectural overhead
- Requires event store infrastructure
- Overkill for current requirements
- Large refactoring effort

### Option 3: Explicit State Machine with Transition Guards (SELECTED)
Define explicit state machines for position lifecycle and wizard flows using state machine library or pattern.

**Pros:**
- Clear visibility of valid transitions
- Enforces state invariants
- Easy to test state logic
- Balances structure with pragmatism

**Cons:**
- Requires refactoring existing flows
- Need to choose state machine representation

## Decision

We will implement **Option 3: Explicit State Machines** using XState library for complex flows and a lightweight pattern for simpler flows.

### Position Status State Machine

```typescript
import { createMachine, assign } from 'xstate';

// Position status state machine
const positionStatusMachine = createMachine({
  id: 'position',
  initial: 'creating',
  context: {
    positionId: null,
    positionAddress: null,
    errorCount: 0,
  },
  states: {
    creating: {
      on: {
        TRANSACTION_SUBMITTED: 'pending_confirmation',
        CREATION_FAILED: {
          target: 'failed',
          actions: assign({ errorCount: (ctx) => ctx.errorCount + 1 }),
        },
      },
    },
    pending_confirmation: {
      on: {
        TRANSACTION_CONFIRMED: 'active',
        TRANSACTION_FAILED: 'failed',
        TIMEOUT: 'failed',
      },
      after: {
        300000: 'failed', // 5 minute timeout
      },
    },
    active: {
      on: {
        START_REBALANCE: 'rebalancing',
        START_CLOSE: 'closing',
        STOP_LOSS_TRIGGERED: 'closing',
        TAKE_PROFIT_TRIGGERED: 'closing',
      },
    },
    rebalancing: {
      initial: 'closing_old',
      states: {
        closing_old: {
          on: {
            CLOSE_CONFIRMED: 'creating_new',
            CLOSE_FAILED: {
              target: '#position.failed',
              actions: 'rollbackPosition',
            },
          },
        },
        creating_new: {
          on: {
            CREATE_CONFIRMED: '#position.active',
            CREATE_FAILED: {
              target: '#position.failed',
              actions: 'notifyRebalanceFailure',
            },
          },
        },
      },
    },
    closing: {
      on: {
        TRANSACTION_CONFIRMED: 'closed',
        TRANSACTION_FAILED: {
          target: 'active', // Rollback to active on failure
          actions: 'notifyCloseFailed',
        },
      },
    },
    closed: {
      type: 'final',
    },
    failed: {
      on: {
        RETRY: 'creating',
        ABANDON: 'closed',
      },
    },
  },
});

// Usage in use case
class CreatePositionUseCase {
  private positionStateMachine: StateMachine<...>;
  
  async execute(command: CreatePositionCommand) {
    const state = this.positionStateMachine.initialState;
    
    try {
      // Transition to pending_confirmation
      const nextState = this.positionStateMachine.transition(
        state,
        { type: 'TRANSACTION_SUBMITTED' }
      );
      
      // Persist state transition
      await this.persistStateTransition(nextState);
      
      return { success: true };
    } catch (error) {
      // Transition to failed
      const failedState = this.positionStateMachine.transition(
        state,
        { type: 'CREATION_FAILED', error }
      );
      
      await this.persistStateTransition(failedState);
      throw error;
    }
  }
}
```

### Wizard Flow State Machine

```typescript
// Simplified wizard state machine
const createPositionWizardMachine = createMachine({
  id: 'createPositionWizard',
  initial: 'strategy_selection',
  context: {
    poolAddress: null,
    dex: null,
    strategy: null,
    depositMethod: null,
    amount: null,
    autoRebalancing: true,
  },
  states: {
    strategy_selection: {
      on: {
        SELECT_STRATEGY: {
          target: 'deposit_method',
          actions: assign({ strategy: (_, event) => event.strategy }),
        },
        CANCEL: 'cancelled',
      },
    },
    deposit_method: {
      on: {
        SELECT_BALANCED: {
          target: 'amount_selection',
          actions: assign({ depositMethod: 'sol_auto_convert' }),
        },
        SELECT_SINGLE_SIDED: {
          target: 'token_selection',
          actions: assign({ depositMethod: 'single_sided' }),
        },
        BACK: 'strategy_selection',
        CANCEL: 'cancelled',
      },
    },
    token_selection: {
      on: {
        SELECT_TOKEN: {
          target: 'deposit_source',
          actions: assign({ selectedToken: (_, event) => event.token }),
        },
        BACK: 'deposit_method',
        CANCEL: 'cancelled',
      },
    },
    deposit_source: {
      on: {
        SELECT_SOURCE: {
          target: 'amount_selection',
          actions: assign({ depositSource: (_, event) => event.source }),
        },
        BACK: 'token_selection',
        CANCEL: 'cancelled',
      },
    },
    amount_selection: {
      on: {
        ENTER_AMOUNT: {
          target: 'confirmation',
          cond: 'isValidAmount',
          actions: assign({ amount: (_, event) => event.amount }),
        },
        BACK: [
          {
            target: 'deposit_source',
            cond: (ctx) => ctx.depositMethod === 'single_sided',
          },
          {
            target: 'deposit_method',
          },
        ],
        CANCEL: 'cancelled',
      },
    },
    confirmation: {
      on: {
        CONFIRM: 'submitting',
        BACK: 'amount_selection',
        CANCEL: 'cancelled',
      },
    },
    submitting: {
      on: {
        SUCCESS: 'success',
        FAILURE: {
          target: 'amount_selection',
          actions: 'notifyError',
        },
      },
    },
    success: {
      type: 'final',
    },
    cancelled: {
      type: 'final',
    },
  },
}, {
  guards: {
    isValidAmount: (ctx, event) => {
      return event.amount > 0 && event.amount <= ctx.maxAmount;
    },
  },
});
```

### Pending Transaction State Tracking

```typescript
// Enhanced pending transaction schema
const pendingTransactionStateMachine = createMachine({
  id: 'pendingTransaction',
  initial: 'pending',
  context: {
    signature: null,
    operationType: null,
    retryCount: 0,
    submittedAt: null,
    confirmedAt: null,
  },
  states: {
    pending: {
      on: {
        CONFIRMED: {
          target: 'confirmed',
          actions: assign({ confirmedAt: () => Date.now() }),
        },
        FAILED: {
          target: 'failed',
          cond: (ctx) => ctx.retryCount >= 3,
        },
        TIMEOUT: {
          target: 'failed',
          cond: (ctx) => Date.now() - ctx.submittedAt > 300000, // 5 min
        },
        RETRY: {
          target: 'pending',
          actions: assign({ retryCount: (ctx) => ctx.retryCount + 1 }),
        },
      },
    },
    confirmed: {
      on: {
        PROCESS_SUCCESS: 'completed',
        PROCESS_FAILED: 'processing_failed',
      },
    },
    processing_failed: {
      on: {
        RETRY_PROCESSING: 'confirmed',
        ABANDON: 'failed',
      },
    },
    completed: {
      type: 'final',
    },
    failed: {
      type: 'final',
    },
  },
});
```

### State Persistence & Recovery

```typescript
// State transition logger
class StateTransitionService {
  async recordTransition(
    entityType: 'position' | 'transaction' | 'wizard',
    entityId: string,
    fromState: string,
    toState: string,
    event: string,
    context?: Record<string, any>
  ) {
    await db.insert(stateTransitions).values({
      entityType,
      entityId,
      fromState,
      toState,
      event,
      context: JSON.stringify(context),
      timestamp: new Date(),
    });
  }
  
  async getStateHistory(entityType: string, entityId: string) {
    return db
      .select()
      .from(stateTransitions)
      .where(
        and(
          eq(stateTransitions.entityType, entityType),
          eq(stateTransitions.entityId, entityId)
        )
      )
      .orderBy(stateTransitions.timestamp);
  }
  
  async getCurrentState(entityType: string, entityId: string) {
    const history = await this.getStateHistory(entityType, entityId);
    return history[history.length - 1]?.toState ?? null;
  }
}

// Recovery from interrupted flows
class FlowRecoveryService {
  async recoverPosition(positionId: string) {
    const currentState = await stateService.getCurrentState('position', positionId);
    const position = await positionRepo.findById(positionId);
    
    if (!position) {
      throw new Error('Position not found');
    }
    
    // Check for inconsistencies
    if (currentState === 'pending_confirmation' && position.status === 'ACTIVE') {
      // Position was confirmed but state wasn't updated
      logger.warn('Fixing inconsistent position state', { positionId });
      await stateService.recordTransition(
        'position',
        positionId,
        'pending_confirmation',
        'active',
        'RECOVERY',
        { reason: 'state_inconsistency' }
      );
    }
  }
}
```

## Consequences

### Positive

- **Explicit Transitions:** All state transitions documented in machine definitions
- **Guards:** Invalid transitions prevented at runtime
- **Visualizable:** XState visualizer shows flow diagrams automatically
- **Testable:** State machines are pure functions, easy to test
- **Recovery:** Clear path for recovering from interrupted flows
- **Observability:** Full audit trail of state transitions
- **Documentation:** State machine serves as executable documentation

### Negative

- **Learning Curve:** Team needs to learn XState or state machine patterns
- **Refactoring:** Significant effort to migrate existing flows
- **Complexity:** Simple flows may feel over-engineered
- **Library Dependency:** Adds XState as dependency (or need custom implementation)

### Neutral

- **Performance:** Negligible runtime overhead for state transitions
- **Bundle Size:** XState adds ~20KB to bundle (acceptable for benefits)

## Implementation Plan

### Phase 1: Foundation (Week 1-2)
1. Add XState library and typings
2. Create `StateTransitionService` and database table
3. Define position status state machine
4. Add state machine testing utilities

### Phase 2: Position Status (Week 3-4)
1. Integrate position status machine into use cases
2. Update pending transaction worker to use state machine
3. Add recovery service for inconsistent states
4. Migrate CREATE flow to use state machine

### Phase 3: Transaction Tracking (Week 5)
1. Implement pending transaction state machine
2. Update transaction-confirm worker
3. Add retry logic based on state transitions

### Phase 4: Wizard Flows (Week 6-7)
1. Define wizard state machines for each flow
2. Update create-position scene to use wizard machine
3. Update position-detail scene (claim, close, rebalance)

### Phase 5: Rebalance Flow (Week 8)
1. Implement rebalance sub-state machine
2. Integrate with create/close machines
3. Add rollback logic for failed rebalances

### Phase 6: Monitoring & Visualization (Week 9)
1. Add state transition metrics
2. Create dashboards for flow visualization
3. Set up alerts for stuck states

## Validation

Success criteria:
- ✅ No manual status field updates in code (use state machine transitions)
- ✅ All position flows have explicit state machine definitions
- ✅ State inconsistencies automatically detected and logged
- ✅ XState visualizer generates accurate flow diagrams
- ✅ Recovery service can fix interrupted flows
- ✅ Tests cover all state transitions and guards

## Related Work

- ADR 001 (Error handling) – errors trigger state transitions
- ADR 004 (Transaction safety) – state machines enforce idempotency

## References

- XState Documentation: https://xstate.js.org/docs/
- [PRD](../PRD.md) – User flows section
- [System Design](../SystemDesign.md) – State management patterns
- State Machines in TypeScript: https://blog.logrocket.com/guide-state-machines-typescript-xstate/
