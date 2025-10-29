# Position Flow Enhancement Specification

**Version:** 1.0  
**Date:** 2025-01-XX  
**Status:** Planning Phase  
**Related ADRs:** 001, 002, 003, 004

## Executive Summary

This document provides a comprehensive audit of the position lifecycle flows (CREATE, CLAIM, CLOSE, REBALANCE) and outlines technical debt, pain points, and required refactorings to achieve Phase 2 goals. It builds on the PRD and System Design by grounding architectural decisions in actual code behavior.

The audit reveals:
- **Good Foundations:** Clean layering, use case pattern, DEX adapter abstraction, background job infrastructure
- **Technical Debt:** Scattered error handling, incomplete strategy abstraction, ad-hoc state management, weak transaction safety
- **Missing Features:** Single-sided deposits, advanced strategies, automated monitoring, stop-loss/take-profit

## Audit Methodology

1. **Code Review:** Deep dive into scene files, use cases, workers, adapters, and persistence services
2. **Flow Tracing:** End-to-end analysis of each lifecycle operation from user action to database persistence
3. **Documentation Reconciliation:** Compare actual implementation against existing docs and PRD requirements
4. **Gap Analysis:** Identify missing features, weak patterns, and technical debt

## Position Lifecycle Flow Summary

### CREATE Position Flow

**Current Implementation:**

```
User → Scene (wizard) → CreatePositionUseCase → DEX Adapter → WalletService
                                              ↓
                               PendingTransaction + Job Queue
                                              ↓
                          TransactionConfirmWorker → Solana RPC
                                              ↓
                         PositionPersistenceService → Database
                                              ↓
                              Notification + Cache Invalidation
```

**Strengths:**
- ✅ Multi-step wizard with progress indicators
- ✅ SOL auto-convert branch scaffolded (swap jobs)
- ✅ Use case properly validates inputs and orchestrates flow
- ✅ Pending transaction tracks metadata for recovery
- ✅ Worker parses on-chain data and persists position with snapshots
- ✅ Cache invalidation ensures fresh portfolio data

**Pain Points:**

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| **Missing validation** | `create-position.scene.ts:227` (FIXME comment) | High | Could allow invalid single-sided deposits |
| **Incomplete single-sided** | Scene steps 2-3 branches | High | Feature advertised in PRD but not functional |
| **Mixed error logging** | Throughout use case and scene | Medium | Inconsistent observability |
| **No transaction simulation** | `CreatePositionUseCase` | High | Users may face failed transactions without warning |
| **Strategy logic scattered** | Scene + use case | Medium | Hard to add new strategies |
| **No idempotency check** | Use case execution | Critical | Risk of duplicate position creation on retries |
| **Manual instruction parsing** | `TransactionConfirmWorker` | Medium | Fragile, could miss edge cases |
| **Swap job coordination** | SOL auto-convert path | High | No guarantee of ordering or completion before position creation |

**Required Refactorings:**
1. **[ADR-001]** Refactor error handling to use domain error classes
2. **[ADR-002]** Extract strategy logic into `SpotStrategy` class
3. **[ADR-004]** Add idempotency keys to CreatePositionCommand
4. **[Phase 2.1]** Complete single-sided deposit implementation
5. **[Phase 2.2]** Add transaction simulation before submission
6. **[Phase 2.3]** Implement robust swap coordination for SOL auto-convert

---

### CLAIM Fees Flow

**Current Implementation:**

```
User → PositionDetailScene → ClaimFeesUseCase → DEX Adapter → WalletService
                                              ↓
                               PendingTransaction + Job Queue
                                              ↓
                          TransactionConfirmWorker → Solana RPC
                                              ↓
                       ClaimFeesPersistenceService → Database + SwapService
                                              ↓
                              Notification + Cache Invalidation
```

**Strengths:**
- ✅ Clear ownership validation in use case
- ✅ Worker fetches on-chain position for accurate fee amounts
- ✅ Automatic SOL conversion via SwapService
- ✅ Claim history tracked separately from position
- ✅ Snapshots created post-claim for analytics

**Pain Points:**

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| **No user confirmation dialog** | `position-detail.scene.ts` | Medium | Users may claim unintentionally |
| **Hard-coded SOL conversion** | `ClaimFeesUseCase` context | Low | No option to keep claimed tokens |
| **Swap failures silent** | `TransactionConfirmWorker` | High | User may not know if conversion failed |
| **No idempotency** | Use case | Critical | Retries could duplicate claims (blockchain should prevent, but risky) |
| **Estimated vs actual fees mismatch** | Worker parsing | Medium | Users see estimated fees but actual may differ |

**Required Refactorings:**
1. **[ADR-001]** Add domain errors for claim-specific failures
2. **[ADR-004]** Implement idempotency for claim operations
3. **[Phase 2.1]** Add confirmation dialog in scene
4. **[Phase 2.2]** Support configurable payout token (not just SOL)
5. **[Phase 2.3]** Enhance error messaging for swap failures

---

### CLOSE Position Flow

**Current Implementation:**

```
User → PositionDetailScene → ClosePositionUseCase → DEX Adapter → WalletService
                                              ↓
                               PendingTransaction + Job Queue
                                              ↓
                          TransactionConfirmWorker → Solana RPC
                                              ↓
                      ClosePositionPersistenceService → Database + SwapService
                                              ↓
                              Notification + Cache Invalidation
```

**Strengths:**
- ✅ Confirmation required (irreversible action)
- ✅ Optimistic position status update to CLOSED
- ✅ Worker closes segment and computes final PnL
- ✅ Automatic SOL conversion for withdrawn liquidity
- ✅ Final snapshot captures closure metrics

**Pain Points:**

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| **Optimistic update rollback** | `ClosePositionUseCase` | High | If transaction fails, position status remains CLOSED in DB |
| **No pre-close validation** | Use case | Medium | Missing checks for minimum liquidity, outstanding claims, etc. |
| **Swap failure = lost funds** | Worker | Critical | If SOL conversion fails, user may lose access to withdrawn tokens |
| **No idempotency** | Use case | Critical | Retries could attempt double-close |
| **PnL calculation timing** | Worker | Medium | PnL computed after swap, could use pre-swap token values |

**Required Refactorings:**
1. **[ADR-001]** Add validation errors and proper rollback logic
2. **[ADR-003]** Use state machine to handle optimistic updates and rollbacks
3. **[ADR-004]** Implement idempotency to prevent double-close attempts
4. **[Phase 2.1]** Add pre-close validation (outstanding fees, minimum liquidity)
5. **[Phase 2.2]** Enhance swap reliability with retries and fallback
6. **[Phase 2.3]** Display estimated final value before close confirmation

---

### REBALANCE Position Flow

**Current Implementation:**

```
User/Monitor → RebalancePositionUseCase → ClosePositionIxs → WalletService
                                              ↓
                               PendingTransaction + RebalanceSession
                                              ↓
                          TransactionConfirmWorker → Solana RPC (close)
                                              ↓
                              SwapService (all to SOL)
                                              ↓
                         CreatePositionUseCase (new position)
                                              ↓
                          TransactionConfirmWorker → Solana RPC (create)
                                              ↓
                    RebalancePersistenceService → Database (close segment, open new)
                                              ↓
                              Notification + Cache Invalidation
```

**Strengths:**
- ✅ Two-phase approach well-structured (close → create)
- ✅ `RebalanceSessionMetadata` tracks multi-stage flow
- ✅ Worker coordinates swap and creation after close
- ✅ Persistence service closes old segment and opens new one
- ✅ Supports both manual and automated triggers

**Pain Points:**

| Issue | Location | Severity | Impact |
|-------|----------|----------|--------|
| **No atomicity guarantee** | Worker coordination | Critical | Close could succeed but create fail, leaving user without position |
| **SOL conversion failure = funds stuck** | Worker swap logic | Critical | If swaps fail, funds may be in tokens user didn't want |
| **No rollback on create failure** | Worker | High | User ends with closed position and no new position if create fails |
| **Optimistic REBALANCING status** | Use case | High | Position stays in REBALANCING state if flow fails |
| **No idempotency** | Use case | Critical | Retries could double-close or double-create |
| **Rebalance session not recoverable** | Pending transaction metadata | High | If worker crashes, hard to resume multi-stage flow |
| **Auto-rebalance threshold hardcoded** | `PositionMonitorWorker` | Medium | Not respecting user preferences |

**Required Refactorings:**
1. **[ADR-003]** Implement rebalance state machine with rollback logic
2. **[ADR-004]** Add idempotency coordination for multi-step rebalance
3. **[Phase 2.1]** Add transaction simulation for both close and create
4. **[Phase 2.2]** Implement compensation logic for failed create (refund SOL)
5. **[Phase 2.3]** Persist rebalance session to allow resumption after crashes
6. **[Phase 2.4]** Respect user-configured auto-rebalance thresholds

---

## Cross-Cutting Concerns

### Error Handling Gaps

**Current State:**
- Mix of `console.error`, `logger.error`, and thrown errors
- No centralized error classification
- User-facing errors often expose technical details
- Retry logic relies on BullMQ defaults (not domain-aware)

**Issues:**
- Users see cryptic messages like "Adapter.createPositionIx failed"
- No distinction between transient (retry) and permanent (don't retry) failures
- Logs lack structure for effective monitoring
- Hard to diagnose production issues

**Enhancement Plan:** (See ADR-001)
1. Define domain error class hierarchy
2. Map errors to user-friendly messages
3. Implement smart retry strategy based on error category
4. Structured logging with error context

---

### Strategy Abstraction Gaps

**Current State:**
- Strategy selected in wizard but behavior hardcoded
- Spot, Curve, Bid-Ask have same code path
- No strategy-specific validation or messaging
- Single-sided incomplete for all strategies

**Issues:**
- Can't introduce strategy-specific features (e.g., custom bin ranges for Curve)
- Wizard steps identical regardless of strategy selection
- Analytics can't surface strategy-specific insights

**Enhancement Plan:** (See ADR-002)
1. Define `PositionStrategy` interface
2. Implement concrete classes: `SpotStrategy`, `CurveStrategy`, `BidAskStrategy`
3. Strategy registry for discovery and injection
4. Wizard pulls steps from strategy definition

---

### State Management Gaps

**Current State:**
- Wizard state stored in scene context (ephemeral)
- Position status updated directly via repository
- Pending transaction status tracked separately
- Rebalance session metadata in JSON blob
- No formal state machine definitions

**Issues:**
- Complex conditional logic to navigate wizard steps
- Hard to reason about valid state transitions
- Optimistic updates lack rollback mechanisms
- Difficult to visualize flows
- Race conditions possible between position status and transaction status

**Enhancement Plan:** (See ADR-003)
1. Implement XState state machines for wizard flows
2. Define position status state machine with guards
3. Track state transitions in dedicated table
4. Add recovery service for inconsistent states

---

### Transaction Safety Gaps

**Current State:**
- No idempotency keys in commands
- Pending transaction signatures used for deduplication (implicit)
- No transaction simulation before submission
- Multi-step flows (rebalance, SOL auto-convert) not atomic
- Worker may reprocess same confirmation on retry

**Issues:**
- Retries could create duplicate positions/claims
- Users may submit transactions that will fail
- No compensation logic for partial failures
- Swap coordination relies on job queue ordering (fragile)

**Enhancement Plan:** (See ADR-004)
1. Add idempotency keys to all position commands
2. Check idempotency store before execution
3. Simulate transactions before submission
4. Implement coordinator pattern for multi-step flows

---

## Missing Features vs PRD

| Feature | PRD Status | Current Status | Priority | Effort |
|---------|-----------|---------------|----------|--------|
| Single-Sided Deposits | Required | Scaffolded, not functional | P0 | 2 weeks |
| Curve Strategy | Required | Name only, no custom behavior | P1 | 1 week |
| Bid-Ask Strategy | Required | Name only, no custom behavior | P1 | 1 week |
| Auto-Rebalancing | Required | Basic implementation | P0 | Enhancement 1 week |
| Stop-Loss Triggers | Phase 2 | Not implemented | P2 | 2 weeks |
| Take-Profit Triggers | Phase 2 | Not implemented | P2 | 2 weeks |
| Transaction Simulation | Best Practice | Not implemented | P0 | 1 week |
| 2FA for Sensitive Operations | Required | Scaffolded in scene | P1 | 1 week |
| Position Performance Charts | Required | Data tracked, no chart generation | P2 | 2 weeks |
| Fee Claim Thresholds | Phase 2 | Not implemented | P3 | 1 week |

---

## Technical Debt Summary

### High Priority (P0) - Address Immediately

1. **Transaction Idempotency** (ADR-004)
   - **Risk:** Duplicate positions/claims on retries
   - **Effort:** 2 weeks
   - **Blocker for:** Production reliability

2. **Transaction Simulation** (Phase 2.1)
   - **Risk:** Users submit failing transactions, poor UX
   - **Effort:** 1 week
   - **Blocker for:** 95% success rate goal

3. **Rebalance Atomicity** (ADR-003 + ADR-004)
   - **Risk:** Close succeeds but create fails, user loses position
   - **Effort:** 2 weeks
   - **Blocker for:** Auto-rebalancing safety

4. **Error Classification** (ADR-001)
   - **Risk:** Poor observability, wasted retries, bad UX
   - **Effort:** 2 weeks
   - **Blocker for:** Production support

### Medium Priority (P1) - Address in Phase 2

1. **Complete Single-Sided Deposits** (Phase 2.1)
   - **Impact:** PRD requirement, user demand
   - **Effort:** 2 weeks

2. **Strategy Abstraction** (ADR-002)
   - **Impact:** Enables Curve/Bid-Ask differentiation
   - **Effort:** 3 weeks

3. **State Machine Formalization** (ADR-003)
   - **Impact:** Simplifies wizard navigation and recovery
   - **Effort:** 4 weeks

4. **Auto-Rebalance Enhancements**
   - **Impact:** Respect user preferences, better triggers
   - **Effort:** 1 week

### Lower Priority (P2-P3) - Address Post-Phase 2

1. Stop-Loss / Take-Profit Automation
2. Advanced Analytics & Charts
3. Partial Claims / Threshold-Based Claims
4. Multi-DEX Position Management
5. Custom Strategy Builder (power users)

---

## Refactoring Roadmap

### Phase 1: Foundations (Weeks 1-4)

**Goal:** Establish architectural patterns and fix critical safety issues

**Tasks:**
1. Implement domain error classes (ADR-001)
2. Add idempotency key infrastructure (ADR-004)
3. Add transaction simulation to use cases
4. Create state transition tracking table (ADR-003)
5. Refactor CreatePositionUseCase error handling
6. Add idempotency to ClaimFeesUseCase and ClosePositionUseCase

**Outcomes:**
- ✅ Consistent error handling across flows
- ✅ Safe retries with idempotency
- ✅ Transaction simulation prevents failed transactions
- ✅ Foundation for state machine implementation

### Phase 2: Position Creation Enhancements (Weeks 5-8)

**Goal:** Complete single-sided deposits and improve strategy handling

**Tasks:**
1. Define `PositionStrategy` interface (ADR-002)
2. Implement `SpotStrategy` with existing logic
3. Add `CurveStrategy` and `BidAskStrategy` classes
4. Complete single-sided deposit branch in scene
5. Add token selection and deposit source handling
6. Implement price change coverage for single-sided
7. Update wizard to use strategy-driven steps

**Outcomes:**
- ✅ Single-sided deposits fully functional
- ✅ Strategy-specific behavior isolated and testable
- ✅ Easy to add new strategies in future

### Phase 3: Rebalance Safety (Weeks 9-12)

**Goal:** Make rebalance flow safe and atomic

**Tasks:**
1. Implement rebalance state machine (ADR-003)
2. Add rebalance coordinator for multi-step flow (ADR-004)
3. Add compensation logic for failed create step
4. Persist rebalance session for crash recovery
5. Respect user auto-rebalance preferences
6. Add transaction simulation for both steps
7. Enhance monitoring worker to use correct thresholds

**Outcomes:**
- ✅ Rebalance flow safe even with failures
- ✅ Users never lose funds in rebalance
- ✅ Auto-rebalance respects user settings

### Phase 4: State Management (Weeks 13-16)

**Goal:** Formalize state machines for all flows

**Tasks:**
1. Implement wizard state machines with XState
2. Add position status state machine
3. Implement pending transaction state machine
4. Add state transition service and recovery logic
5. Update all use cases to use state machines
6. Add state visualization tooling

**Outcomes:**
- ✅ Clear visibility of all state transitions
- ✅ Invalid transitions prevented
- ✅ Easy to visualize and debug flows

### Phase 5: Polish & Advanced Features (Weeks 17-20)

**Goal:** Complete PRD requirements and add polish

**Tasks:**
1. Add 2FA integration for sensitive operations
2. Implement stop-loss triggers
3. Implement take-profit triggers
4. Add position performance charts
5. Enhance notifications with rich content
6. Add fee claim thresholds
7. Improve error messages throughout

**Outcomes:**
- ✅ All PRD MVP features complete
- ✅ Professional polish and UX
- ✅ Ready for production launch

---

## Success Metrics

### Code Quality
- ✅ Zero `console.error` statements in production code
- ✅ 100% of use cases use domain error classes
- ✅ All position operations have idempotency keys
- ✅ State machines defined for all flows

### Reliability
- ✅ 95%+ position creation success rate (PRD requirement)
- ✅ Zero funds lost due to transaction failures
- ✅ < 1% duplicate transactions from retries
- ✅ Auto-rebalance reliability > 98%

### User Experience
- ✅ All error messages user-friendly and actionable
- ✅ Single-sided deposits fully functional
- ✅ Transaction simulation catches 90%+ failures upfront
- ✅ Average position creation time < 60 seconds

### Observability
- ✅ Structured error logs with consistent fields
- ✅ State transition audit trail available
- ✅ Dashboards for flow completion rates
- ✅ Alerts for stuck transactions/positions

---

## Appendix A: Code Quality Checklist

Use this checklist when implementing enhancements:

**Error Handling:**
- [ ] Use domain error classes, not raw Error
- [ ] Provide user-friendly error messages
- [ ] Log errors with structured context
- [ ] Classify errors as retryable or not

**State Management:**
- [ ] Use state machine for complex flows
- [ ] Record state transitions in database
- [ ] Implement guards for invalid transitions
- [ ] Add rollback logic for failures

**Transaction Safety:**
- [ ] Generate idempotency key for command
- [ ] Check idempotency store before execution
- [ ] Simulate transaction before submission
- [ ] Handle partial failures gracefully

**Testing:**
- [ ] Unit tests for all use cases
- [ ] Integration tests for flows
- [ ] Test error scenarios
- [ ] Test idempotency behavior

**Documentation:**
- [ ] Update flow documentation
- [ ] Document state transitions
- [ ] Update API documentation
- [ ] Add inline comments for complex logic

---

## Appendix B: Related Documentation

- [ADR-001: Error Handling & Classification](../adrs/001-error-handling-classification.md)
- [ADR-002: LP Strategy Abstraction](../adrs/002-lp-strategy-abstraction.md)
- [ADR-003: State Management & State Machines](../adrs/003-state-machine-position-flow.md)
- [ADR-004: Transaction Safety & Idempotency](../adrs/004-transaction-safety-idempotency.md)
- [Create Position Flow](./create-position.md)
- [Claim Fees Flow](./claim-fees.md)
- [Close Position Flow](./close-position.md)
- [Rebalance Flow](./rebalance.md)
- [PRD](../PRD.md)
- [System Design](../SystemDesign.md)
