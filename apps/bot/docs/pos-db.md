## Table Purposes

### 1. **positions** (Main Entity)

- **Purpose**: Core table storing liquidity positions in Meteora pools
- **Key Data**: Position details, PNL tracking, stop-loss/take-profit settings, token amounts, prices
- **Lifecycle**: Created when user opens position → Updated during operations → Closed when position ends

### 2. **positionSnapshots** (Historical Tracking)

- **Purpose**: Time-series snapshots of position values for monitoring and analytics
- **Key Data**: Current value, unrealized PNL, token amounts, prices at specific timestamps
- **Usage**: Performance tracking, charts, historical analysis

### 3. **claimHistory** (Fee Collection Records)

- **Purpose**: Records all fee claims from liquidity provision
- **Key Data**: Claimed amounts in both tokens, USD value, transaction hashes
- **Usage**: Fee tracking, tax reporting, total earnings calculation

### 4. **rebalanceEvents** (Position Lifecycle Events)

- **Purpose**: Records position rebalancing operations (closing old position, opening new one)
- **Key Data**: Old/new position addresses, segment PNL, fees collected during rebalance
- **Usage**: Tracking position evolution, calculating cumulative PNL across rebalances

## Relationship Diagram

```
┌─────────────────┐
│     users       │
│  (id, telegram) │
└─────────┬───────┘
          │ 1:N
          ▼
┌─────────────────┐
│   positions     │◄─────────────────┐
│ (main position  │                  │
│  data & PNL)    │                  │
└─────────┬───────┘                  │
          │ 1:N                      │
          ├─────────────┬─────────────┼─────────────┐
          ▼             ▼             ▼             ▼
┌─────────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│positionSnapshots│ │claimHistory │ │rebalanceEvts│ │transactions │
│(time-series     │ │(fee claims) │ │(rebalances) │ │(operations) │
│ tracking)       │ │             │ │             │ │             │
└─────────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

## Detailed Relationships

### **positions → positionSnapshots** (1:N)

```sql
positionSnapshots.positionId → positions.id
```

- **Purpose**: Track position value over time
- **Frequency**: Regular intervals (hourly/daily) + major events
- **Use Case**: Generate PNL charts, monitor performance

### **positions → claimHistory** (1:N)

```sql
claimHistory.positionId → positions.id
```

- **Purpose**: Record all fee collections
- **Trigger**: When user claims fees or during rebalancing
- **Use Case**: Calculate total fees earned, tax reporting

### **positions → rebalanceEvents** (1:N)

```sql
rebalanceEvents.positionId → positions.id
```

- **Purpose**: Track position rebalancing lifecycle
- **Trigger**: When position is rebalanced (old closed, new opened)
- **Use Case**: Calculate cumulative PNL across multiple position iterations

## Data Flow Example

```
1. User creates position
   ├── Insert into `positions` table
   └── Create initial `positionSnapshot`

2. Position generates fees
   ├── User claims fees
   └── Record in `claimHistory`

3. Position needs rebalancing
   ├── Close old position, open new one
   ├── Record in `rebalanceEvents`
   ├── Update `positions.positionAddress`
   └── Create new `positionSnapshot`

4. Regular monitoring
   └── Create periodic `positionSnapshots`

5. Position closed
   ├── Update `positions.status = 'CLOSED'`
   └── Create final `positionSnapshot`
```

## Key Schema Features

### **Segment-based PNL Tracking**

- `positions.cumulativeAbsolutePnlUSD`: Total PNL across all rebalances
- `positions.currentSegmentInitialUSD`: Starting value of current position iteration
- `rebalanceEvents.segmentPnlUSD`: PNL for each position segment

### **Comprehensive Fee Tracking**

- `claimHistory`: Individual fee claim records
- `positions.feeTokenXAmount/feeTokenYAmount`: Cumulative fees
- `rebalanceEvents.feesCollected`: Fees collected during rebalancing

### **Risk Management Integration**

- `positions.slPercentage/tpPercentage`: Stop-loss/take-profit thresholds
- `positionSnapshots.unrealizedPnlPct`: Current PNL for risk checks
- Time-based and volatility-adjusted stop-loss support

This design enables comprehensive position lifecycle management, accurate PNL calculation across rebalances, detailed fee tracking, and robust risk management for your Meteora liquidity bot.
