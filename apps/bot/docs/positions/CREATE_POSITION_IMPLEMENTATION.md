# CREATE POSITION Flow Implementation Status

## Overview
This document describes the implementation status of the CREATE POSITION flow with ADR frameworks integration.

## Completed Components

### 1. Enhanced Error Framework (ADR-001) ✅
**Location:** `apps/bot/src/domain/position/errors/position-errors.ts`

**Features:**
- Comprehensive error classification with categories (VALIDATION, BLOCKCHAIN, EXTERNAL_SERVICE, etc.)
- User-friendly error messages for every error type
- Retryable flags for smart retry logic
- Error context tracking
- Helper functions: `shouldRetryError()` and `calculateBackoff()`

**Error Classes:**
- `InvalidPositionAmountError` - For invalid amount validation
- `InvalidPoolError` - For invalid pool addresses
- `TransactionFailedError` - For failed transactions
- `RpcError` - For RPC failures (retryable)
- `AdapterError` - For DEX adapter errors
- `TransactionSimulationError` - For simulation failures
- `SlippageExceededError` - For slippage violations
- `PositionLimitExceededError` - For position limits
- `SignatureRejectedError` - For rejected wallet signatures
- `InternalPositionError` - For unexpected errors
- `PositionPersistenceError` - For database errors
- `StrategyValidationError` - For strategy validation

**Exported:** In `apps/bot/src/domain/position/index.ts`

### 2. Finalization Use Case ✅
**Location:** `apps/bot/src/application/position/finalize-position-creation.use-case.ts`

**Purpose:** Handles atomic database persistence after position creation transaction confirmation.

**Features:**
- Creates Position, PositionSegment, and PositionSnapshot in a single transaction
- Proper error handling with `PositionPersistenceError`
- Comprehensive logging at all steps
- Idempotent operation (can be retried safely)

**Usage:** Should be called by `TransactionConfirmWorker` after transaction confirmation

### 3. Enhanced Flow Definition (ADR-002, ADR-003) ✅
**Location:** `apps/bot/src/services/flows/create-position-flow.ts`

**Enhancements:**
- Integrated error framework in validation step
- Strategy pattern integration for validation
- User-friendly error messages
- Proper error classification

**Flow States:**
1. `VALIDATING` - Validate inputs using error framework
2. `BUILDING_TX` - Build transaction (awaits external)
3. `TX_SUBMITTED` - Transaction submitted
4. `TX_CONFIRMING` - Awaiting confirmation
5. `TX_CONFIRMED` - Confirmed
6. `PERSISTING` - Persisting to database
7. `COMPLETED` - Done

### 4. Start Create Position Use Case ✅
**Location:** `apps/bot/src/application/position/start-create-position.use-case.ts`

**Purpose:** Simple use case that starts the CREATE POSITION flow.

**Pattern:**
- Use case: Start the flow
- Flow state machine: Orchestrate steps
- Workers: Execute steps

**Registered:** In DI container

## Architecture Pattern

### Correct Flow Pattern

```
┌─────────────┐
│   Scene     │ (User interaction)
└──────┬──────┘
       │
       │ calls
       ▼
┌─────────────────────────────┐
│  StartCreatePositionUseCase │ (Simple starter)
└──────┬──────────────────────┘
       │
       │ starts
       ▼
┌─────────────────────────┐
│  FlowStateMachine       │ (Orchestrator)
│  - Tracks state         │
│  - Defines transitions  │
│  - Stores checkpoints   │
└──────┬──────────────────┘
       │
       │ executes
       ▼
┌─────────────────────────┐
│  Flow Steps             │
│  1. Validate            │◄── Uses error framework
│  2. Build TX            │◄── Uses strategy pattern
│  3. Submit TX           │◄── Uses adapter
│  4. Confirm TX          │
│  5. Persist             │◄── Uses finalization
└─────────────────────────┘
       │
       │ workers execute
       ▼
┌──────────────────────────┐
│  TransactionConfirmWorker│ (Post-confirmation)
│  - Fetches tx data       │
│  - Calls finalization    │
│  - Sends notifications   │
└──────────────────────────┘
```

### Current Implementation Pattern

The codebase currently has two approaches:

**Old Pattern (apps/bot/src/application/position/create-position.use-case.ts):**
- Use case does everything: validation, tx building, submission, persistence enqueuing
- Not using flow state machine properly
- Mixed concerns

**New Pattern (what we implemented):**
- Flow state machine orchestrates
- Use case just starts the flow
- Workers execute steps
- Clean separation of concerns

## Integration Status

### ✅ Completed
- [x] Error framework with all error classes
- [x] Finalization use case
- [x] Enhanced flow definition with error handling
- [x] Start create position use case
- [x] DI container registration

### ⚠️ Partial
- [ ] Scene integration (still uses old CreatePositionUseCase)
- [ ] Transaction worker integration (has own persistence logic)
- [ ] Full flow runner integration

### ❌ Not Started
- [ ] SOL auto-convert flow steps
- [ ] Single-sided deposit flow steps
- [ ] Swap execution integration with flows
- [ ] Complete error message UI testing

## Migration Path

### Option 1: Keep Old Pattern (Quick Fix)
**Pros:**
- Minimal changes to existing code
- Faster to deploy
- Less risky

**Cons:**
- Doesn't use flow state machine properly
- Mixed concerns
- Harder to maintain long-term

**Steps:**
1. Update old `CreatePositionUseCase` to use error framework
2. Add retry logic with error classification
3. Keep existing architecture

### Option 2: Migrate to Flow Pattern (Proper)
**Pros:**
- Clean architecture
- Uses flow state machine correctly
- Easier to extend with new flows
- Better error recovery

**Cons:**
- More refactoring required
- Need to update workers
- Higher risk of bugs

**Steps:**
1. ✅ Create enhanced flow definition (DONE)
2. ✅ Create StartCreatePositionUseCase (DONE)
3. Update Scene to call StartCreatePositionUseCase instead
4. Create transaction builder step in flow
5. Update TransactionConfirmWorker to call FinalizePositionCreationUseCase
6. Test end-to-end
7. Remove old CreatePositionUseCase

### Option 3: Hybrid Approach (Recommended)
**Description:** Use new error framework and finalization, keep old use case for now, migrate gradually.

**Steps:**
1. ✅ Create error framework (DONE)
2. ✅ Create finalization use case (DONE)
3. Update old CreatePositionUseCase to use error framework
4. Update TransactionConfirmWorker to optionally use FinalizePositionCreationUseCase
5. Test thoroughly
6. Gradually migrate to flow pattern in future iterations

## Next Steps

### Immediate (Phase 1)
1. **Update Scene** to handle enhanced errors with user-friendly messages
2. **Add Error Display** helper function for consistent error formatting
3. **Test Error Scenarios**:
   - Invalid amounts
   - Insufficient balance
   - Pool not found
   - Transaction simulation failures
   - RPC errors
   - Signature rejection

### Short-term (Phase 2)
1. **Update TransactionConfirmWorker** to optionally use new finalization
2. **Add Retry Logic** using `shouldRetryError()` helper
3. **Implement Backoff** using `calculateBackoff()` helper
4. **Add Error Recovery** UI flows

### Long-term (Phase 3)
1. **Full Flow Migration**:
   - Move transaction building into flow step
   - Integrate swap execution with flow
   - Use FlowRunnerWorker properly
2. **Remove Old Code**:
   - Deprecate old CreatePositionUseCase
   - Clean up duplicate persistence logic
3. **Extend Patterns**:
   - Apply to CLAIM, CLOSE, REBALANCE flows
   - Add more sophisticated retry strategies
   - Implement compensation actions

## Testing Checklist

### Error Framework
- [ ] All error classes instantiate correctly
- [ ] User messages are friendly and actionable
- [ ] Retry flags are set correctly
- [ ] Context is captured properly
- [ ] `shouldRetryError()` works as expected
- [ ] `calculateBackoff()` calculates correctly

### Finalization
- [ ] Creates all DB records atomically
- [ ] Handles errors gracefully
- [ ] Can be called multiple times (idempotent)
- [ ] Logs comprehensively

### Flow Definition
- [ ] Validation step uses error framework
- [ ] Strategy validation works
- [ ] State transitions are correct
- [ ] Error messages propagate to UI

### Integration
- [ ] Scene displays user-friendly errors
- [ ] Worker calls finalization correctly
- [ ] Retry logic works with error types
- [ ] End-to-end flow completes successfully

## References

- ADR-001: Error Handling & Classification (`apps/bot/docs/adrs/001-error-handling-classification.md`)
- ADR-002: LP Strategy Abstraction (`apps/bot/docs/adrs/002-lp-strategy-abstraction.md`)
- ADR-003: State Machine Pattern (`apps/bot/docs/adrs/003-state-machine-position-flow.md`)
- ADR-004: Transaction Safety & Idempotency (`apps/bot/docs/adrs/004-transaction-safety-idempotency.md`)
- PRD Section 3.3: Position Creation (`apps/bot/docs/PRD.md`)
- System Design: Position Creation Flow (`apps/bot/docs/SystemDesign.md`)

## Conclusion

We have successfully implemented the **foundational components** for the CREATE POSITION flow with ADR frameworks:
- ✅ Error framework for comprehensive error handling
- ✅ Finalization use case for atomic persistence
- ✅ Enhanced flow definition with error integration
- ✅ Simple starter use case following proper pattern

The architecture is **ready for integration** but requires **scene and worker updates** to complete the migration.

**Recommended approach:** Start with Hybrid (Option 3) - use the new error framework and finalization immediately, keep existing use case for now, and gradually migrate to full flow pattern.
