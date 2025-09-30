### Database Design

For your Telegram bot handling liquidity positions on Meteora (with expansion to other DEXs like Raydium/Orca), I'll design a relational database schema (assuming PostgreSQL for scalability, but adaptable to MongoDB). This covers positions, PNL tracking, stop loss (SL), take profit (TP), and rebalancing/claims. Key entities:

- **Users**: Store user info (Telegram ID as primary key).
- **Positions**: Core table for active/inactive positions, including SL/TP settings.
- **Rebalance_History**: Logs each rebalance event for positions with rebalancing enabled.
- **Claim_History**: Logs fee claims (independent of closure/rebalance).
- **PNL_Snapshots**: Optional for historical PNL tracking (e.g., daily unrealized snapshots), but minimal for now.

Use UUIDs for IDs where needed for uniqueness. Timestamps in UTC. Store values in decimals for precision (e.g., token amounts). Assume you're using an ORM like SQLAlchemy for integration.

#### Schema Tables

| Table Name            | Description                                                                 | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **users**             | Stores Telegram users.                                                      | - user_id (BIGINT, PRIMARY KEY): Telegram user ID.<br>- wallet_address (VARCHAR(44)): Solana wallet pubkey.<br>- created_at (TIMESTAMP): Signup time.<br>- updated_at (TIMESTAMP): Last activity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **positions**         | Tracks each liquidity position (one per pool/user, or multiple if allowed). | - position_id (UUID, PRIMARY KEY): Unique ID.<br>- user_id (BIGINT, FOREIGN KEY to users): Owner.<br>- dex (VARCHAR(20)): 'meteora', 'raydium', 'orca'.<br>- pool_address (VARCHAR(44)): Pool pubkey.<br>- position_address (VARCHAR(44)): Position pubkey (e.g., DLMM position key).<br>- token_a (VARCHAR(44)): Token A mint.<br>- token_b (VARCHAR(44)): Token B mint.<br>- initial_amount_a (DECIMAL(28,9)): Deposited A amount.<br>- initial_amount_b (DECIMAL(28,9)): Deposited B amount.<br>- initial_usd (DECIMAL(18,2)): Initial value in USD.<br>- initial_sol (DECIMAL(18,9)): Initial value in SOL (for hybrid calc).<br>- open_timestamp (TIMESTAMP): When opened.<br>- close_timestamp (TIMESTAMP): When closed (NULL if active).<br>- is_rebalancing_enabled (BOOLEAN): True if auto-rebalance on.<br>- rebalance_threshold (DECIMAL(5,2)): % out-of-range to trigger rebalance (e.g., 20.0).<br>- sl_percentage (DECIMAL(5,2)): Stop loss % (e.g., 10.0 for -10%).<br>- tp_percentage (DECIMAL(5,2)): Take profit % (e.g., 20.0 for +20%).<br>- cumulative_absolute_pnl_usd (DECIMAL(18,2)): Running total realized PNL (includes claims, rebalances).<br>- current_segment_initial_usd (DECIMAL(18,2)): Initial USD for current segment (updates on rebalance).<br>- status (VARCHAR(20)): 'active', 'closed', 'pending_close'.<br>- created_at (TIMESTAMP).<br>- updated_at (TIMESTAMP). |
| **rebalance_history** | Logs each rebalance for a position (if enabled).                            | - rebalance_id (UUID, PRIMARY KEY).<br>- position_id (UUID, FOREIGN KEY to positions).<br>- timestamp (TIMESTAMP): When rebalanced.<br>- old_position_address (VARCHAR(44)): Old position key.<br>- new_position_address (VARCHAR(44)): New position key.<br>- segment_final_usd (DECIMAL(18,2)): Value at segment close.<br>- segment_pnl_usd (DECIMAL(18,2)): Absolute PNL for this segment.<br>- segment_pnl_pct (DECIMAL(5,2)): % PNL for segment.<br>- notes (TEXT): e.g., "Out of range by 25%".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **claim_history**     | Logs each fee claim event (manual or during rebalance/close).               | - claim_id (UUID, PRIMARY KEY).<br>- position_id (UUID, FOREIGN KEY to positions).<br>- timestamp (TIMESTAMP): When claimed.<br>- claimed_amount_a (DECIMAL(28,9)): Claimed fees in A.<br>- claimed_amount_b (DECIMAL(28,9)): Claimed fees in B.<br>- claimed_rewards_other (JSONB): Any other rewards (e.g., {'token_mint': amount}).<br>- claimed_usd (DECIMAL(18,2)): USD value post-swap.<br>- is_during_rebalance (BOOLEAN): True if part of rebalance.<br>- notes (TEXT): e.g., "Manual claim".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

#### Relationships and Indexes

- One-to-Many: users → positions.
- One-to-Many: positions → rebalance_history, positions → claim_history.
- Indexes: On user_id, position_address (for quick lookups), timestamps (for monitoring queries).
- Constraints: Ensure initial_usd > 0, percentages between 0-100 or reasonable bounds.

#### Additional Notes

- **Storage for Monitoring**: Use a task queue (e.g., Celery with Redis) to periodically query active positions (WHERE status = 'active') for SL/TP/rebalance checks. Fetch on-chain data via Solana RPC, calculate unrealized PNL, and trigger actions.
- **Expansion**: Add columns like 'orca_specific_param' if DEX-specific fields needed.
- **Security**: Encrypt wallet keys if stored; use transactions for atomic updates (e.g., on rebalance: update positions, insert to history).
- **Scalability**: Partition by user_id if many users; use JSONB for flexible rewards.
- **Backup/Reporting**: Query claim_history + rebalance_history for tax reports (e.g., SELECT SUM(claimed_usd) FROM claim_history WHERE user_id = ?).

This design is detailed yet minimal—tracks all needed for PNL/SL/TP across scenarios.

### Formulas for PNL, Stop Loss, and Take Profit

All formulas use USD-equivalents (via oracles like Pyth for prices: token_usd = token_amount \* price_token_usd). Assume:

- `initial_usd`: Sum of deposited tokens' USD at open.
- `cumulative_absolute_pnl_usd`: Starts at 0, accumulates realized PNL from claims/rebalances.
- `current_segment_initial_usd`: Starts as initial_usd, updates on rebalance.
- For SL/TP: User sets sl_percentage (positive, e.g., 10 for -10% trigger), tp_percentage (positive, e.g., 20 for +20%).
- At any calc: Fetch current prices, position data (withdrawable liquidity, unclaimed fees/rewards).
- `current_usd = (withdrawable_a * a_usd_price) + (withdrawable_b * b_usd_price) + (unclaimed_fees_a * a_usd) + (unclaimed_fees_b * b_usd) + (unclaimed_rewards * their_usd)` (pre-slippage estimate).
- After actions (claim/close/rebalance): Swap outputs to SOL if needed, then `action_usd = (sol_received * sol_usd_price)` (post-slippage/fees).

#### Without Rebalancing (Single Position, With Mid-Claims)

- **Unrealized PNL (Ongoing, for Monitoring)**:
  - Absolute unrealized_pnl_usd = (current_usd - initial_usd) + cumulative_absolute_pnl_usd # Adds prior claims to current estimate
  - Percentage unrealized_pnl_pct = ((current_usd + cumulative_absolute_pnl_usd) / initial_usd - 1) \* 100

- **SL/TP Check**:
  - If unrealized_pnl_pct <= -sl_percentage → Trigger close.
  - If unrealized_pnl_pct >= tp_percentage → Trigger close.
  - Example: initial_usd=100, cumulative_claims=20, current_usd=85 → unrealized_pnl_pct = ((85 + 20)/100 -1)\*100 = +5% (might not trigger -10% SL).

- **At Mid-Claim**:
  - claimed*usd = (claimed_fees_a * a*usd + claimed_fees_b * b_usd + rewards_usd) post-swap
  - Update: cumulative_absolute_pnl_usd += claimed_usd
  - No change to initial_usd or current_segment_initial_usd (n/a without rebalance).

- **Realized PNL at Final Close**:
  - final*usd = (withdrawn_liquidity_a * a*usd + withdrawn_liquidity_b * b*usd + new_unclaimed_fees_a * a*usd + new_unclaimed_fees_b * b_usd + new_rewards_usd) post-swap # Only new fees since last claim
  - withdrawal_pnl_usd = final_usd - initial_usd
  - Total absolute pnl_usd = withdrawal_pnl_usd + cumulative_absolute_pnl_usd
  - Total pnl_pct = ((final_usd + cumulative_absolute_pnl_usd) / initial_usd - 1) \* 100
  - If no mid-claims: Simplifies to (final_usd / initial_usd - 1) \* 100

#### With Rebalancing Enabled (Multi-Segment, With Mid-Claims)

- **Unrealized PNL (Ongoing, for Monitoring)**:
  - Segment unrealized_delta_usd = current_usd - current_segment_initial_usd
  - Total absolute unrealized_pnl_usd = cumulative_absolute_pnl_usd + segment_unrealized_delta_usd
  - Total unrealized_pnl_pct = ((current_usd + cumulative_absolute_pnl_usd - current_segment_initial_usd + initial_usd) / initial_usd - 1) \* 100 # Adjusts for reinvested segments
  - Simplifies to: ( (current*usd / initial_usd) * (product of all prior segment multipliers) - 1 ) \_ 100, but use the absolute for ease.

- **SL/TP Check**:
  - Same as above: Use total unrealized_pnl_pct vs. -sl_percentage or +tp_percentage to trigger close of current segment.

- **At Mid-Claim (Within a Segment)**:
  - claimed_usd = (claimed_fees/rewards usd) post-swap
  - Update: cumulative_absolute_pnl_usd += claimed_usd
  - No change to current_segment_initial_usd (claims extract earnings, not principal).

- **At Rebalance**:
  - segment_final_usd = (withdrawn_liquidity + any new_unclaimed_fees/rewards) post-swap # Claim new fees if not already mid-claimed
  - segment_pnl_usd = segment_final_usd - current_segment_initial_usd
  - Update: cumulative_absolute_pnl_usd += segment_pnl_usd
  - Then reopen new position: current_segment_initial_usd = segment_final_usd # Reinvest

- **Realized PNL at Final Close**:
  - final_usd = (withdrawn_liquidity + new_unclaimed_fees/rewards) post-swap
  - final_segment_pnl_usd = final_usd - current_segment_initial_usd
  - Update: cumulative_absolute_pnl_usd += final_segment_pnl_usd
  - Total absolute pnl_usd = cumulative_absolute_pnl_usd
  - Total pnl_pct = (final_usd / initial_usd - 1) \* 100 # Since cumulative embeds compounding from rebalances/claims

These formulas cover all combinations: Mid-claims realize fees early but add to cumulative; rebalances compound via segment updates. For breakdowns, sum from histories. If needed, add SOL-based parallels by replacing \_usd with \_sol.
