# Rebalance Feature Implementation Plan

## References
- [SystemDesign.md](../SystemDesign.md) – see §4 *Component Design* (application layer orchestration, job queue) and §5 *Data Architecture* for segment/rebalance data contracts.
- [position-creation-implementation-strategy.md](./position-creation-implementation-strategy.md) – source of the create-position pipeline we must mirror for the "new" position.
- [tx-confirm-flow.md](./tx-confirm-flow.md) – governs pending transaction storage, job scheduling, and transaction parsing responsibilities.
- [implementation-summary.md](./implementation-summary.md) – clarifies how transaction parsing replaced on-chain polling for creation and should inspire our rebalance persistence updates.
- [position-lifecycle-example.ts](./position-lifecycle-example.ts) – shows the conceptual data we need to end up with after a rebalance (segment closure, fees, new segment, rebalance event).

## Goals
1. Allow a manual rebalance initiated from the position detail scene to:
   - close the current Meteora DLMM position,
   - convert all withdrawn liquidity + fees to SOL,
   - re-create a new position in the same pool with the original strategy/bin interval,
   - record the rebalance event, new segment, and refreshed position metrics.
2. Keep the implementation aligned with existing architecture: presentation → application use cases → adapters → wallet submission → pending transaction/job parsing → persistence services.
3. Reuse existing creation/closure flows wherever possible while introducing the minimum new orchestration glue needed.

## High-Level Flow (Happy Path)
1. **User Action**: `position-detail.scene.ts` dispatches "rebalance now".
2. **Application Orchestration**: A revamped `RebalancePositionUseCase` (or lightweight orchestrator it delegates to) performs:
   1. Validation & context loading (position, pool strategy, user wallet).
   2. Builds & submits the **close** transaction, tagging the pending transaction metadata with a `rebalanceSessionId` and desired redeploy parameters.
   3. Immediately builds & submits the **create** transaction for the successor position, also tagging metadata with the same `rebalanceSessionId`.
   4. Returns signatures to the scene so UX can show both Solscan links and progress messaging.
3. **Transaction Confirmation Worker**:
   1. When the close tx confirms, parse it via `parseMeteoraInstructions`, compute withdrawals/fees, optionally execute Jupiter swaps to SOL, and persist an interim rebalance record keyed by `rebalanceSessionId`.
   2. When the create tx confirms, parse actual deposits, then combine with the stored close data to call `rebalancePersistenceService`, producing the new segment + rebalance event and updating the position to ACTIVE with the new address.
   3. Clear interim state, invalidate caches, and dispatch notifications.

## Detailed Implementation Steps

### 1. Presentation Layer (`position-detail.scene.ts`)
- Expand the rebalance approval handler to display multi-step progress consistent with **PRD FR-PORTFOLIO-009** (e.g., “Closing…/Swapping…/Recreating…” messages) using existing `loading()` helper + inline edits.
- Capture both the close and create signatures returned by the use case so we can expose Solscan links in the success copy.
- Update scene state/status transitions to mark the position as `REBALANCING` until the worker sends the completion notification.

### 2. Application Layer Orchestration
1. **Revise `RebalancePositionUseCase`** (or introduce a new orchestrator that it delegates to):
   - Load the position via `IPositionRepository` and ensure it belongs to the user.
   - Retrieve pool + strategy metadata necessary to rebuild identical bin interval (can be stored on position or pulled via adapter; leverage the original creation context fields stored in DB if available).
   - Generate a stable `rebalanceSessionId` (UUID) to tie the downstream transactions together.
   - Reuse adapter-level helpers to build the **close** instructions (likely via `adapter.closePositionIx`) and submit through `WalletService.signAndSendTransactionWithJito` mirroring `ClosePositionUseCase`.
   - Insert a `pendingTransactions` row with `operationType: "CLOSE_POSITION"`, storing:
     - `closeContext` (as today), and
     - new `rebalanceContext` containing `rebalanceSessionId`, `redeployStrategy`, `rangeInterval`, any user overrides, and a hint that a follow-up creation is expected.
   - Immediately compute the capital earmarked for redeployment. Initially we can pull user-configured amounts or derive from the position snapshot; precise amounts will be reconciled post-close.
   - Build the **create** transaction using the same adapter path as `CreatePositionUseCase`.
     - Option 1: Compose a `CreatePositionCommand` and call the existing `CreatePositionUseCase` while injecting metadata (preferred – keeps logic centralized and ensures the worker sees a familiar `CREATE_POSITION` job).
     - Option 2: Inline the adapter call similar to close. If we choose Option 1, extend the use case to accept an optional `rebalanceSessionId` / `rebalanceMetadata` so it can propagate to pending metadata.
   - Ensure the creation metadata includes:
     - `positionCreationContext` (existing structure).
     - `rebalanceContext`: `rebalanceSessionId`, `priorPositionId`, `closeSignature`, and carry-over strategy/bin settings.
   - Return both signatures and new position address (if available) to the caller.
2. **Auxiliary computations**:
   - Reuse `CalculateBalancedDistributionUseCase` or equivalent logic to determine the tokenA/tokenB UI amounts for the new position, using the redeploy SOL budget computed from the close step.
   - Fetch live prices via `TokenPriceService` or adapter exposures to inform those calculations.

### 3. Adapter & Wallet Considerations
- Confirm Meteora adapter exposes `closePositionIx` and `createPositionIx` with the hooks we need; extend if we must feed bin interval metadata explicitly.
- Ensure WalletService has all necessary signer inputs (e.g., position keypair for creation). For rebalancing, we may want to reuse the adapter-provided keypair and pass it through metadata so the worker can persist the new position address prior to confirmation.

### 4. Pending Transaction Metadata & Coordination
- Schema-wise we can keep storing JSONB metadata, but we must standardize a `rebalanceSession` object, e.g.:
  ```json
  {
    "rebalanceSession": {
      "id": "uuid",
      "positionId": "...",
      "closeSignature": "...",
      "createSignature": "...",
      "strategy": "spot",
      "rangeInterval": 12,
      "poolAddress": "...",
      "tokenAMint": "...",
      "tokenBMint": "..."
    }
  }
  ```
- Close pending metadata: include both `closeContext` and `rebalanceSession`.
- Create pending metadata: existing `positionContext` plus `rebalanceSession` fields (so the worker can recognise this creation as part of a rebalance and link to the stored close state).
- No new DB tables should be required if we leverage Redis or a lightweight table for interim state; however, if we need durability across restarts, creating a `RebalanceBuffer` table keyed by session ID may be sensible. (Plan to decide during implementation; aim to keep it simple by using the `PendingTransaction` row itself until both sides complete.)

### 5. Transaction Confirmation Worker Enhancements
1. **Close Handler** (`handleClosePosition`):
   - Detect `rebalanceSession` metadata.
   - After parsing instructions, compute:
     - Final token amounts withdrawn.
     - Fees claimed during close.
   - Execute SOL conversions if requested (see "Swap Handling" below) and record the resulting SOL budget.
   - Persist an interim record (e.g., in-memory cache or DB helper) `{ sessionId, closeSummary }` capturing USD totals, SOL proceeds, final bin state, timestamps, and the original close signature.
   - Skip calling `closePositionPersistenceService` directly for rebalance-driven closes; instead, store raw data so we can derive combined analytics later. (Alternatively, let the closure persistence still run to keep history accurate, but mark the position as `REBALANCING` instead of `CLOSED`.)
2. **Create Handler** (`handleCreatePosition`):
   - When metadata includes `rebalanceSession`, merge the parsed creation data with the cached close summary:
     - New position address + actual deposits.
     - SOL budget consumed.
     - Derived USD valuations using `TokenPriceService`.
   - Call `rebalancePersistenceService.rebalancePosition`, updating it to accept both the close and create signatures plus collected fees / SOL conversions.
   - Clear the interim cache and mark the position ACTIVE again.
   - Invalidate caches and enqueue a `rebalance` notification summarising segment PnL and new range.
3. **Fallbacks**:
   - If one transaction fails or times out, clear interim state and notify the user so they can retry. The close handler should re-open the position status if the create leg never arrives.

### 6. Persistence Layer Updates
- Extend `rebalancePersistenceService.rebalancePosition` to accept:
  - `closeSignature`, `createSignature` separately (currently a single `signature`).
  - Segment final USD derived from the close leg (value + fees) and starting USD for the new segment from the create leg.
  - SOL proceeds for reporting (store on `rebalanceEvents` or related snapshot fields as needed).
- Ensure cumulative metrics align with the lifecycle example (update `Position.totalRealizedPnlUSD`, `totalFeesClaimedUSD`, `PositionSegment` entries, `ClaimHistory` for fees claimed during rebalance).
- If we run `closePositionPersistenceService` as part of the close leg, guard it to avoid double-closing the position for rebalance sessions (maybe allow it to operate but keep status `REBALANCING`).

### 7. Swap to SOL Handling
- Follow §Claim Fees Flow in `tx-confirm-flow.md`: swaps happen inside the transaction confirmation worker using Jupiter.
- Implement a reusable helper/service (e.g., `TokenSwapService.swapTokenToSol(user: User, mint: string, amountLamports: bigint)`) so `handleClaimFees`, `handleClosePosition`, and the rebalance pipeline can share logic rather than duplicating commented code.
- This is **infrastructure-level logic**, not a new application-layer use case – the worker already owns “post-transaction settlement” responsibilities per the system design. Therefore we do **not** introduce a dedicated use case; we centralise the swap helper under `services/` (e.g., `swap-to-sol.service.ts`) and inject it into the worker.
- The helper should:
  1. Fetch a Jupiter route for mint→SOL.
  2. Build the swap transaction.
  3. Use `WalletService.signAndSendTransactionWithJito` to execute it on behalf of the user.
  4. Return the SOL received (Decimal) so we can record accurate USD values.
- Add retry/error handling; on swap failure fall back to price-based USD estimation as documented in `tx-confirm-flow.md`.

### 8. Notifications, Caching, and UX Feedback
- Reuse `JobQueueService` to enqueue a `JOB_NOTIFICATION` of type `rebalance` once persistence finishes, including segment PnL, SOL proceeds, and new range details (per PRD).
- Invalidate both `CachePatterns.portfolioPattern(userId)` and `CachePatterns.positionPattern(positionId)` after the create leg is processed.
- Optionally schedule a fresh monitoring job (respecting `autoRebalance` flag) once the new position is active.

### 9. Testing & Observability
- **Unit tests**:
  - `RebalancePositionUseCase` orchestrator: ensures it submits both transactions and enriches metadata correctly.
  - Worker helpers: parsing & combination logic for rebalance sessions, swap helper with mocked Jupiter responses.
- **Integration tests** (mocked RPC): simulate close + create confirmations to verify the worker drives `rebalancePersistenceService` and updates DB state as expected.
- **Logging**: add structured logs for session ID, signatures, and stage to aid troubleshooting; reuse the logging patterns set in `implementation-summary.md`.

### 10. Edge Cases & Recovery
- Handle partial failures:
  - Close succeeded but create submission fails → keep the SOL proceeds ready and inform the user; allow manual retry (perhaps via storing the session info so we can restart from creation once the user re-initiates).
  - Create succeeds but metadata doesn’t match cached session → log and fall back to treating it as a normal creation.
- Ensure rate limits with Jupiter are respected (batch sequential swaps if both token legs require conversion).
- Confirm 2FA / wallet preconditions before initiating rebalancing (same guards as close/create flows).

## Swap-to-SOL Responsibility (Answer to the Question)
- Per the system design, token-to-SOL conversion is part of the **post-transaction settlement** executed by background workers using infrastructure services (Jupiter, WalletService). We therefore keep the swap logic within `TransactionConfirmWorker`, but extract it into a shared helper/service so it is testable and reusable.
- **No new use case is required**: the swap does not represent a user-facing command but an implementation detail after a transaction confirms. We will, however, formalise it as `TokenSwapService` (or similar) so the worker’s `handleClosePosition`, `handleClaimFees`, and new rebalance logic can call a common method instead of duplicating Jupiter integration.

## Open Questions / To Finalise During Implementation
- Whether we need a durable `rebalance_sessions` table or can rely solely on metadata + cache for correlating close/create legs.
- Confirm adapter outputs provide all fields needed to recreate the original bin/range; otherwise plan to compute via helper utilities.
- Validate that Privy wallet permissions permit back-to-back transactions (close → create → swap) without additional end-user prompts.

This plan keeps the rebalance feature consistent with the existing architecture, ensures accurate accounting of fees/PnL, and answers the swap-handling requirement while avoiding unnecessary new application-layer abstractions.
