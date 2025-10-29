# XState Refactor Proposal

## Why XState?

You're absolutely right - using XState instead of vanilla JavaScript would significantly reduce boilerplate and provide better tooling. Here's the comparison:

## Before (Vanilla JS) vs After (XState)

### Current Implementation (Vanilla JS)

**Lines of code**: ~570 lines for `flow-state-machine.ts` + ~160 per flow = ~1,210 lines total

**Issues**:
- ❌ Verbose state transition logic
- ❌ Manual guards and actions
- ❌ No visualization tooling
- ❌ Custom retry/error handling
- ❌ Hard to test state transitions
- ❌ No type safety for state transitions
- ❌ Manual persistence coordination

**Example** (current):
```typescript
// ~120 lines for one flow definition
export const createPositionFlowDefinition = {
  flowType: FlowType.CREATE_POSITION,
  maxRetries: 3,
  timeoutMs: 10 * 60 * 1000,
  steps: [
    {
      name: "validate",
      state: CreatePositionState.VALIDATING,
      handler: async (context: FlowContext<CreatePositionCheckpoint>) => {
        logger.info({ flowId: context.flowId }, "[CreatePositionFlow] Validating");
        
        if (!checkpoint.poolAddress) {
          return { success: false, error: "Missing poolAddress" };
        }
        // ... more validation
        
        return {
          success: true,
          state: CreatePositionState.BUILDING_TX,
        };
      },
    },
    // ... 4 more steps with similar verbosity
  ],
};
```

### With XState

**Lines of code**: ~150 lines per machine + ~100 shared adapter = ~650 lines total (**~45% reduction**)

**Benefits**:
- ✅ Declarative state definitions
- ✅ Built-in guards, actions, services
- ✅ Visual debugger (@xstate/inspect)
- ✅ Strong TypeScript inference
- ✅ Easy testing (@xstate/test)
- ✅ Built-in retry/error handling
- ✅ Native persistence support

**Example** (with XState):
```typescript
// ~100 lines for same flow - 50% reduction!
export const createPositionMachine = createMachine({
  id: "createPosition",
  initial: "validating",
  context: { /* ... */ },
  states: {
    validating: {
      invoke: {
        src: "validateInputs",
        onDone: "buildingTx",
        onError: "failed",
      },
    },
    buildingTx: {
      on: {
        TX_SUBMITTED: {
          target: "txSubmitted",
          actions: assign({ signature: (_, e) => e.signature }),
        },
      },
    },
    txSubmitted: {
      on: {
        TX_CONFIRMED: {
          target: "persisting",
          actions: assign({ positionAddress: (_, e) => e.positionAddress }),
        },
      },
    },
    persisting: {
      invoke: {
        src: "persistPosition",
        onDone: "completed",
        onError: "failed",
      },
    },
    completed: { type: "final" },
    failed: {
      on: {
        RETRY: {
          target: "validating",
          cond: "canRetry",
          actions: assign({ retryCount: (ctx) => ctx.retryCount + 1 }),
        },
      },
    },
  },
}, {
  guards: {
    canRetry: (ctx) => ctx.retryCount < 3,
  },
  services: {
    validateInputs: async (ctx) => {
      if (!ctx.poolAddress) throw new Error("Missing poolAddress");
      // ... validation logic
    },
  },
});
```

## Migration Plan

### Phase 1: Add XState Dependencies (No Breaking Changes)

```bash
pnpm add xstate@^5.0.0
pnpm add -D @xstate/inspect @xstate/test
```

### Phase 2: Create XState Machines Alongside Current Implementation

Keep existing implementation, add XState versions side-by-side:

```
src/services/flows/
├── xstate/                      # New XState implementations
│   ├── create-position.machine.ts
│   ├── claim-fees.machine.ts
│   ├── close-position.machine.ts
│   ├── rebalance.machine.ts
│   ├── flow-persistence.adapter.ts
│   └── flow-runner.service.ts
├── flow-types.ts               # Keep (shared types)
├── flow-state-machine.ts       # Keep (persistence layer reused)
├── create-position-flow.ts     # Keep initially (gradual migration)
└── index.ts                    # Export both versions
```

### Phase 3: Test XState Implementation

- Unit test machines with @xstate/test
- Integration test with actual database
- Compare behavior with vanilla implementation
- Performance testing

### Phase 4: Gradual Migration

1. Update CreatePositionUseCase to use XState machine (test in staging)
2. Monitor for issues
3. Migrate other flows (CLAIM, CLOSE, REBALANCE)
4. Remove vanilla implementations after all flows migrated

### Phase 5: Cleanup

- Remove old flow definitions
- Clean up unused code
- Update documentation

## Detailed XState Implementation

### 1. Base XState Service

```typescript
// src/services/flows/xstate/flow-runner.service.ts
import { interpret, AnyStateMachine, State } from "xstate";
import { FlowRepository } from "../flow-state-machine";
import { persistMachineState, restoreMachineState } from "./flow-persistence.adapter";

export class XStateFlowRunner {
  constructor(private repository: FlowRepository) {}

  /**
   * Start a new flow or resume existing
   */
  async start<T>(
    machine: AnyStateMachine,
    flowId: string,
    options: {
      userId: string;
      walletAddress: string;
      flowType: string;
      intent: string;
      initialContext?: T;
    }
  ) {
    // Try to restore existing state
    let state = await restoreMachineState<T>(machine, flowId, this.repository);
    
    if (!state && options.initialContext) {
      // Create new state with initial context
      state = State.create(machine.initialState, options.initialContext);
    }

    // Create interpreter with auto-persistence
    const service = interpret(machine, {
      state: state || undefined,
    })
      .onTransition((state) => {
        // Auto-persist on every transition
        persistMachineState(state, {
          flowId,
          flowType: options.flowType as any,
          userId: options.userId,
          walletAddress: options.walletAddress,
          intent: options.intent,
        }, this.repository);
      })
      .start();

    return service;
  }

  /**
   * Resume existing flow
   */
  async resume(machine: AnyStateMachine, flowId: string) {
    const state = await restoreMachineState(machine, flowId, this.repository);
    
    if (!state) {
      throw new Error(`Flow ${flowId} not found`);
    }

    const service = interpret(machine, { state })
      .onTransition((state) => {
        persistMachineState(state, {
          flowId,
          // ... options from database
        } as any, this.repository);
      })
      .start();

    return service;
  }
}
```

### 2. Complete Machine Example with All Features

```typescript
// src/services/flows/xstate/create-position.machine.ts
import { createMachine, assign } from "xstate";

export const createPositionMachine = createMachine({
  id: "createPosition",
  initial: "validating",
  predictableActionArguments: true,
  context: {
    userId: "",
    poolAddress: "",
    signature: "",
    retryCount: 0,
    error: undefined,
  },
  states: {
    validating: {
      invoke: {
        src: "validateInputs",
        onDone: {
          target: "buildingTx",
        },
        onError: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.data.message,
          }),
        },
      },
    },
    
    buildingTx: {
      // Wait for external event
      on: {
        TX_SUBMITTED: {
          target: "txSubmitted",
          actions: assign({
            signature: (_, event) => event.signature,
          }),
        },
        ERROR: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.error,
          }),
        },
      },
    },
    
    txSubmitted: {
      // Poll for confirmation
      invoke: {
        src: "waitForConfirmation",
        onDone: {
          target: "persisting",
          actions: assign({
            positionAddress: (_, event) => event.data.positionAddress,
          }),
        },
        onError: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.data.message,
          }),
        },
      },
      // Or wait for external event
      on: {
        TX_CONFIRMED: {
          target: "persisting",
          actions: assign({
            positionAddress: (_, event) => event.positionAddress,
          }),
        },
      },
    },
    
    persisting: {
      invoke: {
        src: "persistPosition",
        onDone: {
          target: "completed",
        },
        onError: {
          target: "failed",
          actions: assign({
            error: (_, event) => event.data.message,
          }),
        },
      },
    },
    
    completed: {
      type: "final",
    },
    
    failed: {
      on: {
        RETRY: [
          {
            target: "validating",
            cond: "canRetry",
            actions: assign({
              retryCount: (ctx) => ctx.retryCount + 1,
              error: undefined,
            }),
          },
        ],
      },
    },
  },
}, {
  guards: {
    canRetry: (ctx) => ctx.retryCount < 3,
  },
  services: {
    validateInputs: async (ctx) => {
      if (!ctx.poolAddress) {
        throw new Error("Missing poolAddress");
      }
      // ... validation
    },
    
    waitForConfirmation: async (ctx) => {
      // Poll blockchain for confirmation
      // Return when confirmed or throw on timeout
    },
    
    persistPosition: async (ctx) => {
      // Save to database
    },
  },
  actions: {
    logStateChange: (ctx, event) => {
      console.log("State changed", ctx, event);
    },
  },
});
```

### 3. Visual Debugging

```typescript
// src/dev-tools/xstate-inspector.ts
import { inspect } from "@xstate/inspect";

if (process.env.NODE_ENV === "development") {
  inspect({
    iframe: false, // Use separate window
    url: "https://stately.ai/viz?inspect",
  });
}

// Then in your service:
const service = interpret(machine, {
  devTools: true, // Enable inspector
}).start();
```

## Benefits Summary

### Developer Experience
- ✅ **50% less boilerplate** (650 vs 1,210 lines)
- ✅ **Visual debugging** - See state transitions in real-time
- ✅ **Better testing** - @xstate/test generates test paths
- ✅ **Type safety** - Inferred types for context, events, states
- ✅ **Standard patterns** - Industry-proven state machine patterns

### Reliability
- ✅ **Proven library** - Used by Netflix, Microsoft, Amazon
- ✅ **Built-in error handling** - Structured error states
- ✅ **Atomic transitions** - No invalid state combinations
- ✅ **Easy to reason about** - Declarative definitions

### Maintenance
- ✅ **Less custom code** - Rely on XState internals
- ✅ **Community support** - Active Discord, docs, examples
- ✅ **Visualization tools** - Generate diagrams automatically
- ✅ **Easier onboarding** - Standard state machine concepts

## Recommendation

**YES, we should migrate to XState**. Benefits far outweigh the migration effort:

1. **Immediate**: Add XState alongside current implementation (no breaking changes)
2. **Week 1-2**: Build XState machines, test thoroughly
3. **Week 3**: Migrate CREATE_POSITION flow (highest volume)
4. **Week 4+**: Migrate remaining flows
5. **Remove old code** once XState proven in production

## Questions?

- Want me to create the complete XState implementation?
- Should we start with just CREATE_POSITION or all flows?
- Any concerns about XState dependency?

Let me know and I'll proceed with the refactor! 🚀
