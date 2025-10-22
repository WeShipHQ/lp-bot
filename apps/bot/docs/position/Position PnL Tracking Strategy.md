Summary: Position PnL Tracking Strategy
Your Questions Answered

1. How to display PnL when positions rebalance automatically?
   Answer: Show a brief notification when rebalancing occurs, but keep the position "active" from the user's perspective. The key insight is:

Logical Position (user view): One continuous investment
Physical Segments (on-chain): Multiple positions that change with rebalancing

What to show users:

✅ During rebalancing: "Position rebalanced: +$50 gain realized from this segment"
✅ In portfolio: Always show cumulative PnL (unrealized + realized + fees)
❌ Don't say: "Position closed" during auto-rebalancing (confusing!)

2. How to handle fees in PnL calculations?
   Answer: Fees are additions to PnL, not reductions in position value.
   typescript// Correct formula:
   Total PnL = (Current Value - Initial Investment) + Total Fees Claimed

// Breaking it down:
Unrealized PnL = Current Value - Current Segment Initial Value
Realized PnL = Sum of all closed segments' gains
Total Fees = All claimed fees (manual + rebalance + closure)
Total PnL = Unrealized + Realized + Total Fees

```

When fees are claimed:
- Add to `totalFeesClaimedUSD` in position
- Add to segment's `feesClaimedUSD`
- Position value doesn't change (tokens are already in wallet)

**3. How to handle Take-Profit and Stop-Loss?**

**Answer**: Automatically **close the entire position** when triggered:

1. Cron job runs every 5 minutes checking all active positions
2. If TP or SL threshold hit → trigger automatic closure
3. Close position on-chain, claim all fees, convert to SOL
4. Show user comprehensive final summary
5. Send notification: "Take-profit target reached (+45%)"

### Database Design Benefits

The new schema provides:

1. **Segment Tracking**: Each rebalance creates a new segment, preserving history
2. **Cumulative PnL**: Easy to calculate across all segments
3. **Fee Attribution**: Know exactly which fees came from which segment
4. **Historical Data**: Snapshots for charts and analytics
5. **Audit Trail**: Complete history via `rebalanceEvents` table

### Implementation Flow

**Position Creation:**
```

User creates position
→ Insert into `positions` table
→ Create first `positionSegment`
→ Take initial `snapshot`

```

**Auto-Rebalancing:**
```

Cron detects out-of-range position
→ Close current segment (set end time, final value, PnL)
→ Claim fees → Update totalFeesClaimedUSD
→ Create new segment
→ Record in `rebalanceEvents`
→ Update position (increment segment number, update address)
→ Send brief notification to user

```

**Manual Fee Claim:**
```

User clicks "Claim Fees"
→ Claim on-chain
→ Insert into `claimHistory`
→ Update position's totalFeesClaimedUSD
→ Update current segment's feesClaimedUSD
→ Take snapshot
→ Position remains ACTIVE

```

**Position Closure:**
```

User clicks "Close" or TP/SL triggers
→ Claim remaining fees
→ Close position on-chain
→ Close current segment
→ Calculate final PnL (all segments + all fees)
→ Update position status to CLOSED
→ Take final snapshot
→ Show comprehensive summary
Key Principles

Never confuse users - Rebalancing is internal, position stays "open"
Always show cumulative PnL - Never segment-only numbers
Fees are gains - Add to PnL, don't subtract from value
TP/SL close everything - Not just segments, the entire position
Track everything - Segments, events, snapshots for full history
