# PnL & Analytics Model (v2)

## Overview

Profit and Loss reporting underpins portfolio summaries, closure receipts, and future analytics features noted in the PRD. The Meteora bot derives PnL from a combination of snapshots, segments, and claim history. This document explains the data model, the formulas applied during each lifecycle event, and the services responsible for maintaining consistency.

## Data Model

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `positions` | Canonical record per on-chain position | `initialValueUSD`, `initialValueSOL`, `finalValueUSD`, `totalRealizedPnlUSD`, `totalFeesClaimedUSD`, `currentSegmentNumber`, `isRebalancingEnabled`, `slPercentage`, `tpPercentage` |
| `positionSegments` | Segment per rebalance cycle | `segmentNumber`, `initialValueUSD`, `finalValueUSD`, `realizedPnlUSD`, `feesClaimedUSD`, `startPositionAddress`, `endPositionAddress`, `closureReason` |
| `positionSnapshots` | Point-in-time values (creation, claim, rebalance, closure) | `snapshotType`, `currentValueUSD`, `tokenXAmount`, `tokenYAmount`, `unrealizedPnlUSD`, `totalPnlUSD`, `tokenXPriceUSD`, `tokenYPriceUSD`, `solPriceUSD` |
| `claimHistory` | Fee withdrawals | `claimedTokenXAmount`, `claimedTokenYAmount`, `claimedUSDValue`, `claimType` (`manual`, `rebalance`, `closure`) |
| `rebalanceEvents` | Audit entries for rebalances | `segmentInitialUSD`, `segmentFinalUSD`, `feesCollectedUSD`, `segmentPnlUSD`, `triggerReason` |

Prices are sourced via `TokenPriceService`, using on-chain or oracle data consistent with the SystemDesign guidelines. All monetary values are stored as strings to avoid floating-point drift but are processed with `Decimal.js` in services.

## Lifecycle Calculations

### 1. Creation (`position-persistence.service.ts`)

- **Initial Value (USD)** = `tokenAAmount * tokenAPriceUsd + tokenBAmount * tokenBPriceUsd`
- **Initial Value (SOL)** = `initialValueUSD / solPriceUsd` (unless the user provided an explicit SOL amount)
- Initializes `currentSegmentNumber = 1` and `currentSegmentInitialUSD = initialValueUSD`
- Snapshot `snapshotType = "creation"` stores zeroed PnL fields.

### 2. Manual Fee Claim (`claim-fees-persistence.service.ts`)

- **Claim USD** = sum of token amounts × their USD prices; if swaps succeed, recompute using actual SOL proceeds
- Update `positions.totalFeesClaimedUSD += claimUsd`
- Update active segment `feesClaimedUSD += claimUsd`
- Snapshot `snapshotType = "claim"` recalculates:
  - `unrealizedPnlUSD` = `currentValueUSD - segmentInitialUSD`
  - `totalPnlUSD` = `totalRealizedPnlUSD + unrealizedPnlUSD + totalFeesClaimedUSD`
  - Percentages derive from the same numerators divided by their respective denominators (`segmentInitialUSD` and `positions.initialValueUSD`)

### 3. Rebalance (`rebalance-persistence.service.ts`)

- **Segment Final USD** = `tokenAAmount * tokenAPriceUsd + tokenBAmount * tokenBPriceUsd`
- **Segment PnL USD** = `segmentFinalUSD - segmentInitialUSD`
- **Fees Collected (USD)** = claimed fee amounts × USD prices (if any)
- Close current segment with realised PnL, record rebalance event, then create a new segment with `initialValueUSD = segmentFinalUSD`
- Update `positions.totalRealizedPnlUSD += segmentPnlUSD` and `positions.totalFeesClaimedUSD += feesCollectedUSD`
- Snapshot `snapshotType = "rebalance"` resets unrealised PnL (new baseline) and records updated totals.

### 4. Close (`close-position-persistence.service.ts`)

- **Final Value USD** = result of swapping all liquidity to SOL (preferred) or sum of token amounts × prices
- **Fees Claimed USD** = remaining fees converted to SOL or valued using prices
- **Segment PnL USD** = `(finalValueUSD + feesClaimedUSD) - segmentInitialUSD`
- **Total PnL USD** = `positionValueGain + totalFeesClaimedUSD`
  - `positionValueGain` = `finalValueUSD - initialValueUSD`
- **Total PnL %** = `Total PnL USD / initialValueUSD`
- Update `positions` with final values, mark `status = CLOSED`, and set `closedAt`
- Snapshot `snapshotType = "closure"` zeroes unrealised PnL and records final totals for reporting.

## Access Patterns

- **Position Detail UI** – `GetPositionUseCase` hydrates domain entities with the latest database values, making `Position.calculatePnL()` available to formatters.
- **Portfolio Overview** – Aggregates `positions.currentValueUSD`, `totalRealizedPnlUSD`, and `totalFeesClaimedUSD` to compute portfolio metrics.
- **Historical Analytics** – `claimHistory` and `rebalanceEvents` provide chronological data for charts or exports.

## Implementation Notes

1. **Decimal Handling** – Always use `Decimal.js` inside services to prevent rounding errors, then store fixed-point strings.
2. **Price Fallbacks** – If price data is missing, log a warning and skip derived metrics instead of persisting incorrect values.
3. **Snapshots for Monitoring** – Snapshots allow reconstruction of unrealised/realised PnL at any moment. They should be captured at every material lifecycle event (creation, claim, rebalance, closure, future auto-close).
4. **Cache Invalidation** – After each persistence event, invalidate `CachePatterns.portfolioPattern(userId)` and, if applicable, `CachePatterns.positionPattern(positionId)`.

## Extensibility

- **Daily Snapshots** – Introduce a scheduled job to capture `snapshotType = "daily"` for time-series analytics without overloading live flows.
- **Impermanent Loss Metrics** – Store pool benchmarks alongside snapshots to calculate IL vs. HODL, aligning with advanced analytics in the PRD roadmap.
- **Export Support** – Reuse `positionSegments` and `claimHistory` when implementing CSV/JSON exports (`Settings → Export Data`).
- **Multi-DEX** – Ensure future adapters populate compatible token metadata so the persistence services remain DEX-agnostic.

Keeping these rules consistent ensures users receive trustworthy PnL figures, reinforcing the bot’s reliability and aligning with the PRD’s KPI targets (≥95 % accuracy for financial reporting).
