# Risk Management (Stop-Loss & Take-Profit)

## Overview

Risk controls ensure the bot honours PRD requirements for automated downside protection and profit locking. Today, stop-loss and take-profit preferences are persisted per user and propagated to position records, but enforcement is not yet live. This document captures the current wiring and the recommended implementation strategy to activate these safeguards.

## Current State

### Data Model

| Source | Fields | Notes |
| --- | --- | --- |
| `UserPreferences` | `stopLossPercentage`, `takeProfitPercentage` | Managed via the `/settings` flow (`settingsHandler`) |
| `positions` table | `slPercentage`, `tpPercentage` (text columns) | Populated during creation (`PositionPersistenceService.createPosition`) when provided |
| `RebalanceSessionMetadata` | `slPercentage`, `tpPercentage` | Carried through during auto-rebalance cycles |

### UX Touchpoints

- **Settings Menu** – Users configure global percentages in the Telegram UI (`settings.ts`). Values are stored as percentages (1–100) or `null` when disabled.
- **Creation Flow** – The current wizard does not collect custom per-position overrides, but defaults could be injected from user preferences before calling the use case.

### Enforcement Gaps

- `PositionMonitorWorker` only evaluates in-range status; it does not compare current price against stop-loss/take-profit thresholds.
- No jobs are enqueued to auto-close positions when thresholds are breached.
- Notifications for triggered stop-loss/take-profit events do not yet exist.

## Target Behaviour

1. **Stop-Loss** – Automatically close the position when price drops more than X% below the initial (or previous rebalance) value.
2. **Take-Profit** – Automatically close the position when price appreciates more than Y% above the baseline.
3. **User Feedback** – Send proactive notifications when a threshold is crossed and when the closure transaction is submitted.
4. **Audit Trail** – Persist closure reason (`stop_loss` / `take_profit`) for reporting.

## Implementation Strategy

### 1. Propagate Preferences During Creation

- During summary computation in `create-position.scene.ts`, inject `ctx.user.stopLossPercentage` / `takeProfitPercentage` into the `CreatePositionUseCase` command.
- Ensure `PositionCreationContext` captures the values so the confirm worker can write them to `positions.slPercentage`/`tpPercentage`.

### 2. Monitor Thresholds in `PositionMonitorWorker`

Enhance the worker to evaluate price movements on every poll:

```typescript
const currentPrice = onchain?.price ?? 0;
const baselinePrice = res.position.currentSegmentInitialPrice; // derive from persistence
const slPct = res.position.slPercentage; // numeric
const tpPct = res.position.tpPercentage; // numeric

if (slPct && priceDrop(currentPrice, baselinePrice) >= slPct) {
  enqueueAutoClosure('stop_loss');
}

if (tpPct && priceGain(currentPrice, baselinePrice) >= tpPct) {
  enqueueAutoClosure('take_profit');
}
```

- **Price Inputs** – Use the on-chain price from the adapter when available; fall back to price oracle or snapshots for baseline.
- **Avoid Duplicate Triggers** – Store a debounced flag in cache (`CachePatterns.positionProtection(positionId)`) to prevent repeated enqueues within a short window.

### 3. Auto-Closure Job

- Reuse `ClosePositionUseCase` with `closureReason` set to the relevant trigger.
- Introduce a lightweight `JOB_AUTO_CLOSE` or reuse `JOB_REBALANCE` with a distinct `reason`. If a new queue is preferred, define `AutoCloseJobData` mirroring `RebalanceJobData`.
- Record the trigger time in pending metadata for later analytics.

### 4. Notifications

- Extend `transaction-confirm.worker.ts` to tailor notifications based on `closureReason`. For example, prefix the summary with "⚠️ Stop-loss triggered" or "🎯 Take-profit hit".
- Optionally send a pre-close notification when the worker enqueues the close (so users know a protective action is underway).

### 5. Persistence Enhancements

- Ensure `close-position-persistence.service.ts` persists the closure reason (already stored) and that reporting surfaces it via APIs.
- Add analytics fields (e.g., `stopLossTriggeredAt`) if historical analysis is required.

## Edge Cases & Considerations

- **Volatility Whipsaws** – Introduce hysteresis (e.g., require price to stay beyond the threshold for N minutes) to avoid flip-flopping. This can be managed by delaying the auto-close job or by re-checking a snapshot right before submission.
- **Manual Overrides** – If a user manually closes or rebalances while a protective job is queued, cancel or ignore the queued job to avoid duplicate transactions.
- **Partial Closures** – Unsupported today; the first implementation should always close the entire position to keep calculations simple.
- **Multi-DEX** – Price feeds must be adapter-agnostic. Ensure each adapter exposes consistent metadata for price retrieval.

## Activation Checklist

- [ ] Capture user preferences during creation and store per position.
- [ ] Update `PositionMonitorWorker` to evaluate thresholds.
- [ ] Enqueue auto-close jobs with deduplication.
- [ ] Tailor notifications for protective triggers.
- [ ] Validate persistence and reporting outputs include the closure reason.

Once complete, the stop-loss/take-profit features will fully comply with the PRD’s automation and safety criteria.
