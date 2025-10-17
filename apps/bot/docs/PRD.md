# Product Requirements Document (PRD)
## Meteora Liquidity Bot - Telegram DeFi Assistant

**Version:** 1.0  
**Last Updated:** October 17, 2025  
**Status:** Active Development  
**Focus:** Meteora DEX (Initial), Multi-DEX (Future)

---

## 1. Executive Overview

### 1.1 Purpose
The Meteora Liquidity Bot is a Telegram-based application that simplifies liquidity provision on Solana-based decentralized exchanges (DEXes). The bot provides a mobile-friendly, conversational interface for DeFi users to create and manage liquidity positions, track portfolio performance, and discover trending tokens—all without leaving Telegram.

### 1.2 Product Vision
Democratize DeFi liquidity provision by removing technical barriers and providing automated management tools that rival desktop applications, accessible entirely through Telegram's messaging interface.

### 1.3 Target Users
- **Primary**: Retail DeFi users seeking simplified liquidity provision on mobile devices
- **Secondary**: Active traders looking for quick position management on-the-go
- **Tertiary**: Crypto newcomers exploring liquidity provision with guided experiences

### 1.4 Key Value Propositions
1. **Accessibility**: Manage DeFi positions without installing apps or using desktop browsers
2. **Simplicity**: Abstract complex DeFi concepts into simple button clicks and guided flows
3. **Automation**: Reduce manual monitoring with auto-rebalancing and price alerts
4. **Discovery**: Surface trending tokens and optimal pools for better investment decisions
5. **Security**: Non-custodial wallet management through Privy integration

### 1.5 Success Metrics
- **User Adoption**: 1,000+ active users within 3 months of launch
- **Position Creation**: 50+ new positions created daily
- **User Retention**: 60%+ monthly active user retention
- **Transaction Success Rate**: 95%+ successful position creation/modification
- **User Satisfaction**: 4.5+ average rating from user feedback
- **Portfolio Value**: $1M+ total value locked (TVL) across all user positions

---

## 2. User Roles & Permissions

### 2.1 Liquidity Provider (Primary Role)

**Registration Method:**
- User initiates interaction by sending `/start` command to bot
- Bot prompts for Privy wallet authentication via Telegram
- Upon successful authentication, user profile is created with linked wallet
- User receives welcome message with wallet address and initial navigation menu

**Core Permissions:**
- Create new liquidity positions on supported DEXes
- View and manage existing positions in portfolio
- Close positions and claim fees/rewards
- View wallet balance and transaction history
- Configure bot settings (auto-rebalancing, notifications)
- Access trending tokens and pool recommendations
- Set up two-factor authentication for sensitive operations
- Generate and share referral codes

**Authentication Requirements:**
- Telegram account verification (automatic)
- Privy wallet connection (one-time setup)
- Optional 2FA for position creation, closing, and wallet operations

---

## 3. Feature Modules

### 3.1 Start Interface

**Purpose:** Provide entry point and primary navigation hub for all bot features.

**Functional Requirements:**

**FR-START-001: Welcome Message**
- **Trigger:** User sends `/start` command or clicks "Start" button
- **Behavior:**
  - Display personalized greeting: "Welcome back, [Username]! 👋"
  - Show wallet address in format: `Wallet: Sol1x...xyz` with copy button (📋)
  - Display SOL balance: "Balance: 12.45 SOL ($1,245.50)"
  - Show last updated timestamp: "Updated: 2 mins ago"
- **Success Criteria:** All information displays correctly within 2 seconds

**FR-START-002: Primary Navigation Menu**
- **Display:** Telegram inline keyboard with buttons arranged in grid layout
- **Buttons (2x3 grid):**
  - Row 1: `🔓 Open Position` | `📊 Portfolio`
  - Row 2: `💰 Wallet` | `⚙️ Settings`
  - Row 3: `🔥 Trending` | `❓ Help`
- **Behavior:** Each button triggers corresponding feature command
- **Success Criteria:** All buttons are clickable and navigate correctly

**FR-START-003: Wallet Copy Functionality**
- **Trigger:** User clicks copy button (📋) next to wallet address
- **Behavior:**
  - Copy full wallet address to clipboard
  - Display temporary toast notification: "✅ Wallet address copied!"
  - Notification disappears after 3 seconds
- **Success Criteria:** Address copied correctly in all Telegram clients (iOS, Android, Desktop)

**FR-START-004: Balance Refresh**
- **Trigger:** User clicks refresh button (🔄) next to balance
- **Behavior:**
  - Show loading indicator: "Refreshing..."
  - Fetch latest SOL balance from blockchain
  - Update display with new balance and timestamp
  - Display confirmation: "✅ Balance updated"
- **Success Criteria:** Balance updates within 5 seconds; handles RPC errors gracefully

**User Flow:**
1. User opens Telegram and finds bot
2. User sends `/start` or clicks Start button
3. Bot displays welcome screen with wallet info and navigation
4. User selects desired feature from menu
5. Bot navigates to selected feature

**Error Handling:**
- If wallet not connected: Display "Please connect your wallet first" with "Connect Wallet" button
- If balance fetch fails: Display last known balance with "(cached)" indicator
- If RPC unavailable: Show error message with retry button

---

### 3.2 Trending Tokens

**Purpose:** Help users discover high-potential pools and trending tokens for liquidity provision.

**Functional Requirements:**

**FR-TREND-001: Trending Pools Display**
- **Trigger:** User clicks "🔥 Trending" button or sends `/trending` command
- **Display Format (per pool):**
  ```
  1. SOL-USDC ✅
     TVL: $12.5M | 24h Vol: $8.2M
     APY: 45.2% | Fee/TVL: 0.65%
     [📈 Details] [➕ Open Position]
  ```
- **Information Shown:**
  - Rank number (1-10)
  - Token pair name with verification badge (✅ if verified)
  - Total Value Locked (TVL) in USD
  - 24-hour trading volume
  - Annual Percentage Yield (APY)
  - Fee-to-TVL ratio (key profitability metric)
  - Action buttons: Details and Open Position
- **Success Criteria:** All pools display within 3 seconds with accurate, real-time data

**FR-TREND-002: Sorting and Filtering**
- **Default Sort:** Fee/TVL ratio (descending) - shows most profitable pools first
- **Sort Options (inline keyboard):**
  - `📊 Fee/TVL` (default)
  - `💰 TVL`
  - `📈 Volume`
  - `🎯 APY`
- **Behavior:** Clicking sort button re-orders list and shows loading indicator
- **Success Criteria:** List re-sorts within 2 seconds; maintains pagination state

**FR-TREND-003: Pagination**
- **Display:** 10 pools per page
- **Navigation Buttons:**
  - `⬅️ Previous` (disabled on page 1)
  - `Page 1 of 5`
  - `➡️ Next` (disabled on last page)
- **Behavior:** Clicking Previous/Next fetches and displays new page
- **Success Criteria:** Pagination works smoothly; no duplicate pools across pages

**FR-TREND-004: Pool Details Quick View**
- **Trigger:** User clicks "📈 Details" button on any pool
- **Display:**
  - Full pool name and DEX badge (🟣 Meteora)
  - Current price: "1 SOL = 102.5 USDC"
  - 24h price change: "+5.2%" (green) or "-3.1%" (red)
  - 24h fee earnings: "$15.2K"
  - Historical APY chart (text-based 7-day trend)
  - Pool address with copy button
  - Link to DEX website: "View on Meteora 🔗"
  - Buttons: `➕ Open Position` | `« Back to List`
- **Success Criteria:** All data displays within 2 seconds; external links work correctly

**FR-TREND-005: Direct Position Creation**
- **Trigger:** User clicks "➕ Open Position" from trending list or pool details
- **Behavior:**
  - Save selected pool context to session
  - Launch Create Position flow (Section 3.3) with pool pre-selected
  - Display pool name at top of position creation wizard
- **Success Criteria:** Seamless transition to position creation with no data loss

**FR-TREND-006: Token Address Input**
- **Trigger:** User clicks "🔍 Search by Address" button at top of trending list
- **Display:** Message prompt: "Please enter a Solana token address to find its pools:"
- **Validation:**
  - Check if input is valid Solana address (base58, 32-44 characters)
  - If invalid: "❌ Invalid token address. Please try again."
  - If valid: Search for pools containing this token
- **Search Results:**
  - Display list of pools containing the token (same format as trending)
  - If no pools: "No active pools found for this token"
  - If multiple: Show all sorted by TVL
- **Success Criteria:** Address validation instant; pool search completes within 5 seconds

**FR-TREND-007: Pool Verification Badge**
- **Verified Pool (✅):** Both tokens have verified metadata on-chain
- **Unverified Pool (⚠️):** One or both tokens lack verification
- **Behavior:** Display warning tooltip on hover/long-press: "This pool contains unverified tokens. Exercise caution."
- **Success Criteria:** Clear visual distinction between verified and unverified pools

**User Flow (Scenario 1: Browse Trending):**
1. User clicks "🔥 Trending" button
2. Bot displays top 10 pools sorted by Fee/TVL ratio
3. User browses list, checks APY and TVL metrics
4. User clicks "📈 Details" on interesting pool
5. Bot shows detailed pool information
6. User clicks "➕ Open Position"
7. Bot launches position creation flow with pool pre-selected

**User Flow (Scenario 2: Search by Token):**
1. User clicks "🔥 Trending" button
2. User clicks "🔍 Search by Address" button
3. User enters token address
4. Bot validates address and searches pools
5. Bot displays matching pools
6. User selects pool and proceeds to position creation

**Error Handling:**
- If API fails: Display cached data with "(cached 10m ago)" indicator
- If no trending data: Show "Trending data temporarily unavailable. Try again shortly."
- If network error during sort: Keep current list and show "Unable to re-sort. Please try again."

---

### 3.3 Position Creation

**Purpose:** Guide users through creating new liquidity positions with optimal strategy selection and clear confirmations.

**Functional Requirements:**

**FR-CREATE-001: Pool Selection Entry Points**
- **Entry Point 1:** From Trending list (pool pre-selected)
- **Entry Point 2:** User sends `/create` command (requires pool selection)
- **Entry Point 3:** User sends pool URL (auto-detected and parsed)
- **Entry Point 4:** From Portfolio screen "➕ Add Position" button
- **Success Criteria:** All entry points seamlessly launch position creation wizard

**FR-CREATE-002: Pool URL Auto-Detection**
- **Trigger:** User sends message with Meteora pool URL
- **Supported Formats:**
  - `https://app.meteora.ag/dlmm/[pool-address]`
  - `https://app.meteora.ag/pools/[pool-address]`
- **Behavior:**
  - Bot detects URL pattern in message
  - Extracts pool address from URL
  - Fetches pool data from Meteora API
  - If valid: Launch position creation wizard with pool pre-loaded
  - If invalid: "❌ Unable to load pool from URL. Please check the link."
- **Success Criteria:** URL detection works for all standard Meteora formats; pool data loads within 3 seconds

**FR-CREATE-003: Manual Pool Selection**
- **Trigger:** User enters position creation without pre-selected pool
- **Display:** "Select a pool to create position:"
- **Options (inline keyboard):**
  - `🔥 Choose from Trending` → Shows trending pools list
  - `🔍 Enter Token Address` → Prompts for address input
  - `🔗 Paste Pool URL` → Prompts for URL paste
  - `« Cancel` → Returns to main menu
- **Success Criteria:** All selection methods work reliably; cancel returns to previous screen

**FR-CREATE-004: Pool Information Display**
- **Display:** Once pool selected, show pool card at top of each wizard step:
  ```
  🟣 Meteora DLMM
  SOL-USDC ✅
  Price: 1 SOL = 102.5 USDC
  TVL: $12.5M | Fee/TVL: 0.65%
  ─────────────────────────
  ```
- **Persistence:** Pool card remains visible throughout entire wizard
- **Success Criteria:** Pool information updates correctly if user backtracks

**FR-CREATE-005: Strategy Selection**
- **Display:** "Choose your position strategy:"
- **Options (inline keyboard with descriptions):**
  ```
  [🎯 Spot (Recommended)]
  Balanced liquidity around current price
  Best for: Stable pairs, beginners
  
  [📊 Curve]
  Concentrated liquidity in narrow range
  Best for: Experienced users, volatile pairs
  
  [⚡ Bid-Ask]
  Provide liquidity on one side
  Best for: Directional bets, specific tokens
  
  [« Back]
  ```
- **Behavior:** User selects one strategy; selection highlighted
- **Help Text:** Each option shows tooltip on long-press explaining strategy
- **Success Criteria:** Strategy selection persists; user can go back to change

**FR-CREATE-006: Deposit Method Selection**
- **Display:** "How would you like to deposit liquidity?"
- **Options (inline keyboard):**
  ```
  [💱 SOL Auto-convert (Easiest)]
  Deposit SOL, bot converts to both tokens
  Required SOL: ~[amount] + fees
  
  [🎯 Single-sided Token]
  Deposit one token, provide liquidity on one side
  Requires: Token balance in wallet
  
  [« Back] [Skip »]
  ```
- **Default:** SOL Auto-convert (marked as "Easiest")
- **Behavior:**
  - If "SOL Auto-convert" selected: Skip to amount selection
  - If "Single-sided" selected: Show token selection screen
- **Success Criteria:** Clear distinction between methods; user understands choice

**FR-CREATE-007: Token Selection (Single-sided Only)**
- **Display:** "Which token would you like to deposit?"
- **Options (inline keyboard):**
  ```
  [🪙 SOL]
  Balance: 12.45 SOL ($1,245.50)
  
  [💵 USDC]
  Balance: 500 USDC ($500.00)
  
  [« Back]
  ```
- **Display Logic:**
  - Show actual wallet balance for each token
  - Disable button if balance is zero (grayed out)
  - Show USD equivalent value
- **Success Criteria:** Balances are real-time and accurate

**FR-CREATE-008: Deposit Source Selection (Single-sided Only)**
- **Display:** "How would you like to acquire [selected token]?"
- **Options (inline keyboard):**
  ```
  [🔄 Convert from SOL]
  Swap SOL to [token] then deposit
  Estimated SOL needed: ~[amount]
  
  [💼 Use Token Balance]
  Deposit from existing [token] balance
  Available: [amount] [token]
  
  [« Back]
  ```
- **Conditional Display:**
  - "Use Token Balance" disabled if insufficient balance
  - Show minimum required balance: "Min: 10 USDC"
- **Success Criteria:** Options reflect actual wallet state; disabled states clear

**FR-CREATE-009: Amount Selection**
- **Display:** "How much would you like to deposit?"
- **Options (2x2 grid + custom):**
  ```
  [25% of Balance]    [50% of Balance]
  [75% of Balance]    [100% (Max)]
  
  [✏️ Enter Custom Amount]
  
  [« Back]
  ```
- **Calculation:**
  - Calculate percentage based on available SOL or selected token
  - Display estimated USD value next to each percentage
  - "Max" option reserves 0.05 SOL for fees and buffer
- **Custom Amount:**
  - If user clicks "Enter Custom Amount": Prompt "Enter amount in [SOL/TOKEN]:"
  - Validate input is numeric and within available balance
  - If invalid: "❌ Invalid amount. Must be between 0.1 and [max]."
- **Success Criteria:** Percentage calculations accurate; custom input validated properly

**FR-CREATE-010: Price Change Coverage (Single-sided Only)**
- **Display:** "Set price change coverage for your position:"
- **Explanation:** "This determines the price range where your liquidity will be active."
- **Options (inline keyboard):**
  ```
  [±5%]  [±10%]  [±20%]
  [±50%] [✏️ Custom]
  
  [« Back]
  ```
- **Preview:** Show estimated range: "Range: 97.4 - 107.6 USDC per SOL"
- **Custom Input:**
  - Prompt: "Enter price change percentage (1-100):"
  - Validate: Must be between 1% and 100%
  - If invalid: "❌ Please enter a value between 1 and 100."
- **Recommendation:** Show "Recommended: ±10%" for stable pairs
- **Success Criteria:** Range calculation accurate based on current price

**FR-CREATE-011: Auto-rebalancing Option**
- **Display:** "Enable automatic rebalancing?"
- **Explanation:** "Bot will automatically rebalance your position when price moves outside range."
- **Options (inline keyboard):**
  ```
  [✅ Yes (Recommended)]
  Automatically maintain optimal range
  
  [❌ No]
  Manually manage rebalancing
  
  [⚙️ Configure Threshold]
  Set custom rebalancing trigger
  
  [« Back]
  ```
- **Default Threshold:** 20% price deviation from range
- **Configure Threshold:**
  - If user clicks "Configure": Show threshold options (10%, 20%, 30%, 50%)
  - Store preference for this position
- **Success Criteria:** User understands rebalancing implications; preference saved

**FR-CREATE-012: Position Summary & Confirmation**
- **Display:** Complete summary of position before creation:
  ```
  📋 Position Summary
  ─────────────────────────
  Pool: SOL-USDC (Meteora)
  Strategy: Spot
  Deposit: 5 SOL (~$500)
  Method: Auto-convert
  Range: 97.4 - 107.6 USDC/SOL
  Auto-rebalance: Yes (20% threshold)
  
  Estimated Composition:
  • 2.5 SOL (~$250)
  • 256.25 USDC (~$256)
  
  Fees & Costs:
  • Position creation: 0.02 SOL
  • Swap fee: ~0.01 SOL
  • Total cost: ~5.03 SOL
  
  Expected APY: 45.2%
  Est. Daily Earnings: ~$0.62
  
  [✅ Confirm & Create] [✏️ Edit] [❌ Cancel]
  ```
- **Confirmation Button:** Clear call-to-action, requires single tap
- **Edit Button:** Returns to last step for modifications
- **Cancel Button:** Confirmation dialog: "Are you sure? Progress will be lost."
- **Success Criteria:** All information accurate; user can review before confirming

**FR-CREATE-013: Position Creation Execution**
- **Trigger:** User taps "✅ Confirm & Create"
- **Process Flow:**
  1. Show loading message: "⏳ Creating your position..."
  2. Step indicators: "Building transaction... ✅"
  3. "Requesting signature... ⏳"
  4. "Submitting to blockchain... ⏳"
  5. "Confirming transaction... ⏳"
  6. Success or failure message
- **Success Message:**
  ```
  ✅ Position Created Successfully!
  
  Transaction: [signature link]
  Position ID: [position-address]
  
  Your position is now active and earning fees!
  
  [📊 View Position] [🏠 Home]
  ```
- **Failure Handling:**
  - If user rejects signature: "❌ Signature rejected. No funds were transferred."
  - If transaction fails: "❌ Transaction failed: [error reason]. Please try again."
  - If slippage exceeded: "❌ Price moved too much. Please try again with higher slippage."
  - Always provide "Try Again" button
- **Success Criteria:** 95%+ success rate for valid inputs; clear error messages; transaction link works

**FR-CREATE-014: 2FA Verification (if enabled)**
- **Trigger:** After user confirms, before transaction submission
- **Display:** "🔐 Two-factor authentication required"
- **Code Input:** "Enter 6-digit code from authenticator app:"
- **Validation:**
  - User enters 6-digit code
  - Verify code against user's 2FA secret
  - If valid: Proceed with transaction
  - If invalid: "❌ Invalid code. Try again. (2 attempts remaining)"
  - If 3 failed attempts: Cancel transaction and lock 2FA for 5 minutes
- **Timeout:** Code entry times out after 2 minutes
- **Success Criteria:** 2FA adds security without frustrating UX; timeout prevents hanging states

**FR-CREATE-015: Position Creation Limits**
- **Maximum Concurrent Positions:** 10 active positions per user
- **Minimum Deposit Amounts:**
  - SOL Auto-convert: 0.1 SOL minimum
  - Single-sided: 10 USDC or equivalent minimum
- **Validation:** Check limits before confirmation screen
- **Error Messages:**
  - If limit reached: "❌ Maximum 10 positions allowed. Please close an existing position first."
  - If below minimum: "❌ Minimum deposit is [amount]. Please increase your amount."
- **Success Criteria:** Limits enforced consistently; users understand restrictions

**User Flow (Complete Path):**
1. User clicks "🔥 Trending" and selects SOL-USDC pool
2. Bot displays pool information and strategy options
3. User selects "Spot" strategy
4. Bot asks for deposit method
5. User selects "SOL Auto-convert"
6. Bot asks for deposit amount
7. User selects "50% of Balance" (5 SOL)
8. Bot asks about auto-rebalancing
9. User enables auto-rebalancing with 20% threshold
10. Bot shows complete position summary
11. User reviews and clicks "Confirm & Create"
12. If 2FA enabled: User enters 2FA code
13. Bot builds transaction and requests signature
14. User approves signature in wallet
15. Bot submits transaction to blockchain
16. Bot confirms transaction and shows success message
17. User clicks "View Position" to see details

**Error Handling:**
- Wallet not connected: Redirect to wallet connection flow
- Insufficient balance: Show exact shortfall and suggest amounts
- Pool unavailable: "This pool is temporarily unavailable. Try another pool."
- Network congestion: Retry transaction with higher priority fee
- RPC timeout: Automatic retry up to 3 times with exponential backoff

---

### 3.4 Portfolio Management

**Purpose:** Provide comprehensive view of all liquidity positions with performance tracking and management tools.

**Functional Requirements:**

**FR-PORTFOLIO-001: Portfolio Overview**
- **Trigger:** User clicks "📊 Portfolio" button or sends `/portfolio` command
- **Display:** Summary card + position list:
  ```
  💼 Your Portfolio
  ─────────────────────────
  Total Value: $12,450.50
  Total P&L: +$1,245.05 (+11.1%) 🟢
  Unclaimed Fees: $42.30
  Active Positions: 5
  Last Updated: 2 mins ago 🔄
  ─────────────────────────
  
  1. SOL-USDC (Meteora) ✅
     Value: $5,000 | P&L: +$550 (+12.3%)
     APY: 45.2% | Fees: $18.50
     [📊 Details]
  
  2. RAY-SOL (Meteora) ⚠️
     Value: $2,500 | P&L: -$125 (-4.8%)
     APY: 38.1% | Fees: $8.20
     [📊 Details]
  
  [... more positions]
  
  [➕ Add Position] [⚙️ Filter] [🔄 Refresh]
  ```
- **Sorting:** Default sorted by value (descending)
- **Success Criteria:** All positions load within 3 seconds; values accurate to blockchain state

**FR-PORTFOLIO-002: Portfolio Metrics**
- **Total Value:** Sum of current USD value of all positions
- **Total P&L:**
  - Calculation: (Current Value - Initial Value + Claimed Fees) / Initial Value
  - Display: Absolute USD and percentage with color coding
  - Green (🟢) if positive, Red (🔴) if negative
- **Unclaimed Fees:** Sum of all unclaimed fees across positions in USD
- **Active Positions:** Count of positions with status "ACTIVE"
- **Auto-refresh:** Refresh every 5 minutes automatically in background
- **Success Criteria:** Calculations accurate; matches blockchain state

**FR-PORTFOLIO-003: Position List Item**
- **Information per Position:**
  - Token pair name with DEX badge (🟣 Meteora)
  - Verification status (✅ verified, ⚠️ unverified)
  - Current value in USD
  - Profit/Loss (absolute and percentage) with color coding
  - Current APY
  - Unclaimed fees in USD
  - Quick action button: "📊 Details"
- **Visual Indicators:**
  - Green border for profitable positions
  - Red border for losing positions
  - Yellow badge if position is out of range
  - Blue badge if auto-rebalancing is enabled
- **Success Criteria:** All data displays correctly; visual indicators clear

**FR-PORTFOLIO-004: Position Filtering**
- **Trigger:** User clicks "⚙️ Filter" button
- **Filter Options (multi-select):**
  ```
  DEX:
  [✅ Meteora] [  Orca] [  Raydium] [  Saros]
  
  Status:
  [✅ Active] [  Out of Range] [  Closed]
  
  Performance:
  [  Profitable Only] [  Loss Only] [  All]
  
  Sort By:
  • Value (High → Low)
  ○ P&L (High → Low)
  ○ APY (High → Low)
  ○ Fees (High → Low)
  
  [Apply Filters] [Reset]
  ```
- **Behavior:**
  - Filters apply immediately on selection
  - Show count of filtered positions: "Showing 3 of 5 positions"
  - Persist filter preferences across sessions
- **Success Criteria:** Filters work correctly; combinations handled properly

**FR-PORTFOLIO-005: Refresh Functionality**
- **Trigger:** User clicks "🔄 Refresh" button
- **Behavior:**
  1. Show loading indicator on button: "🔄 Refreshing..."
  2. Fetch latest data for all positions from blockchain
  3. Update portfolio metrics and position values
  4. Show success message: "✅ Portfolio updated"
  5. Display new timestamp
- **Rate Limiting:** Max 1 refresh per 30 seconds to prevent spam
- **Success Criteria:** Refresh completes within 10 seconds; handles multiple positions efficiently

**FR-PORTFOLIO-006: Position Details View**
- **Trigger:** User clicks "📊 Details" on any position
- **Display:** Comprehensive position information:
  ```
  🟣 Meteora DLMM Position
  SOL-USDC ✅
  
  📊 Performance
  ─────────────────────────
  Current Value: $5,000.00
  Initial Deposit: $4,500.00
  Profit/Loss: +$550.00 (+12.3%) 🟢
  
  Position Age: 15 days
  Average Daily P&L: +$36.67
  
  💰 Fees & Rewards
  ─────────────────────────
  Unclaimed Fees: $18.50
  • 0.012 SOL ($1.20)
  • 17.30 USDC ($17.30)
  
  Claimed Fees: $125.50
  Total Fees: $144.00
  
  Fee APY: 45.2%
  Est. Daily Fees: $0.62
  
  📈 Position Composition
  ─────────────────────────
  Current Balances:
  • 24.5 SOL ($2,450) - 49%
  • 2,550 USDC ($2,550) - 51%
  
  Initial Balances:
  • 22.5 SOL ($2,250)
  • 2,250 USDC ($2,250)
  
  ⚙️ Position Settings
  ─────────────────────────
  Strategy: Spot
  Price Range: 97.4 - 107.6 USDC/SOL
  Current Price: 102.5 USDC/SOL
  Status: ✅ In Range
  
  Auto-rebalance: ✅ Enabled (20%)
  Last Rebalance: 5 days ago
  
  🔗 Links
  ─────────────────────────
  Position: [address] 📋
  Transaction: [view on Solscan] 🔗
  Pool: [view on Meteora] 🔗
  
  ─────────────────────────
  [💸 Claim Fees] [🔄 Rebalance]
  [❌ Close Position] [« Back]
  ```
- **Success Criteria:** All information accurate; links functional; calculations correct

**FR-PORTFOLIO-007: Performance Chart**
- **Display:** Text-based 7-day performance trend in position details
- **Format:**
  ```
  7-Day Performance:
  Day 1: ████████░░ +8.5%
  Day 2: ██████████ +10.2%
  Day 3: ████████░░ +9.1%
  Day 4: ███████░░░ +7.8%
  Day 5: █████████░ +11.5%
  Day 6: ████████░░ +10.9%
  Day 7: ██████████ +12.3%
  ```
- **Behavior:** Chart updates daily with snapshot data
- **Success Criteria:** Chart renders correctly on all clients; data matches snapshots

**FR-PORTFOLIO-008: Fee Claiming**
- **Trigger:** User clicks "💸 Claim Fees" in position details
- **Display:** Fee claim confirmation:
  ```
  💸 Claim Position Fees
  ─────────────────────────
  Unclaimed Fees:
  • 0.012 SOL ($1.20)
  • 17.30 USDC ($17.30)
  
  Total Value: $18.50
  
  Transaction Fee: ~0.001 SOL
  
  Fees will be sent to your wallet.
  
  [✅ Confirm Claim] [❌ Cancel]
  ```
- **Execution:**
  1. Show loading: "⏳ Claiming fees..."
  2. Submit claim transaction
  3. Wait for confirmation
  4. Success: "✅ Fees claimed! Transaction: [link]"
  5. Update position details to reflect claimed fees
- **Error Handling:**
  - If no fees: "No fees available to claim"
  - If transaction fails: Display error with retry option
- **Success Criteria:** Fees claimed successfully; balance updated; transaction visible

**FR-PORTFOLIO-009: Position Rebalancing**
- **Trigger:** User clicks "🔄 Rebalance" in position details
- **Pre-check:**
  - Verify position is out of optimal range
  - Calculate rebalancing cost (fees + slippage)
  - If cost > potential benefit: Warn user
- **Display:** Rebalancing confirmation:
  ```
  🔄 Rebalance Position
  ─────────────────────────
  Current Situation:
  Price: 115.2 USDC/SOL
  Your Range: 97.4 - 107.6 USDC/SOL
  Status: ⚠️ Out of Range (7.1% above)
  
  Rebalancing Plan:
  • Close current position
  • Claim fees ($18.50)
  • Create new position centered at current price
  • New Range: 103.7 - 126.9 USDC/SOL
  
  Estimated Costs:
  • Transaction fees: ~0.02 SOL
  • Slippage: ~0.5%
  • Total cost: ~$12.50
  
  Expected Benefit:
  • Return to optimal range
  • Resume fee earnings
  • Minimize impermanent loss
  
  ⚠️ Position will be inactive briefly during rebalancing
  
  [✅ Confirm Rebalance] [❌ Cancel]
  ```
- **Execution:**
  1. Show step-by-step progress
  2. "Closing old position... ✅"
  3. "Claiming fees... ✅"
  4. "Creating new position... ⏳"
  5. Success: "✅ Rebalancing complete!"
- **Auto-rebalance:** If enabled and threshold met, bot sends notification: "🔄 Auto-rebalancing triggered for SOL-USDC position"
- **Success Criteria:** Rebalancing completes atomically; position never lost; clear cost-benefit shown

**FR-PORTFOLIO-010: Position Closing**
- **Trigger:** User clicks "❌ Close Position" in position details
- **Display:** Close position confirmation with warnings:
  ```
  ❌ Close Position
  ─────────────────────────
  ⚠️ WARNING: This action cannot be undone
  
  Position Summary:
  Initial Investment: $4,500.00
  Current Value: $5,000.00
  Total P&L: +$550.00 (+12.3%)
  Unclaimed Fees: $18.50
  
  You will receive:
  • ~24.5 SOL
  • ~2,567 USDC
  
  Estimated Total: ~$5,018.50
  Transaction Fee: ~0.02 SOL
  
  Are you sure you want to close this position?
  
  [⚠️ Yes, Close Position] [❌ Cancel]
  ```
- **Safety Confirmation:** Require second confirmation: "Type 'CLOSE' to confirm"
- **Execution:**
  1. Show loading: "⏳ Closing position..."
  2. Close position and claim all fees in single transaction
  3. Success message with final balances
  4. Remove from active portfolio
- **Post-closure:**
  - Position moved to "Closed Positions" archive
  - Show final performance summary
  - Ask for feedback: "Rate this position experience"
- **Success Criteria:** Position closes successfully; all liquidity + fees received; clear final summary

**FR-PORTFOLIO-011: Empty Portfolio State**
- **Display:** When user has no active positions:
  ```
  📊 Your Portfolio
  
  You don't have any active positions yet.
  
  Start earning by providing liquidity!
  
  [🔥 Browse Trending Pools]
  [➕ Create First Position]
  [❓ Learn About Liquidity]
  ```
- **Success Criteria:** Clear call-to-action for new users; educational resources accessible

**FR-PORTFOLIO-012: Closed Positions Archive**
- **Access:** "View History" button at bottom of portfolio
- **Display:** List of closed positions with final performance:
  ```
  📚 Position History
  
  1. SOL-USDC (Meteora)
     Duration: 30 days
     Final P&L: +$850 (+18.9%)
     Total Fees: $245.50
     Closed: 5 days ago
     [View Details]
  
  [... more closed positions]
  ```
- **Sorting:** Most recently closed first
- **Success Criteria:** Historical data preserved; users can review past performance

**User Flow (Portfolio Review):**
1. User clicks "📊 Portfolio"
2. Bot displays portfolio overview with all positions
3. User reviews P&L and fees across positions
4. User clicks "📊 Details" on best-performing position
5. Bot shows detailed position information
6. User clicks "💸 Claim Fees"
7. Bot confirms fee amounts
8. User approves transaction
9. Fees claimed and sent to wallet
10. Position details update with new fee balance

**Error Handling:**
- If position data unavailable: Show last cached data with "(cached)" indicator
- If portfolio load fails: "Unable to load portfolio. Please refresh."
- If RPC error during refresh: Retry automatically up to 3 times
- If position not found on-chain: "This position may have been closed. Refreshing..."

---

### 3.5 Wallet Management

**Purpose:** Provide wallet connection, balance viewing, and transaction history for user's Solana wallet.

**Functional Requirements:**

**FR-WALLET-001: Wallet Overview**
- **Trigger:** User clicks "💰 Wallet" button or sends `/wallet` command
- **Display:**
  ```
  💰 Your Wallet
  ─────────────────────────
  Address: Sol1x...xyz 📋
  
  💎 Balances
  ─────────────────────────
  SOL: 12.450 ($1,245.05)
  USDC: 500.00 ($500.00)
  USDT: 250.00 ($250.00)
  RAY: 85.5 ($125.50)
  
  Total Value: $2,120.55
  
  📊 In Positions: $12,450.50
  💰 In Wallet: $2,120.55
  ═════════════════════════
  Total Assets: $14,571.05
  
  [🔄 Refresh] [💸 Send] [📜 History]
  [⚙️ Settings]
  ```
- **Token Display:**
  - Show all tokens with non-zero balance
  - Display amount and USD value
  - Sort by USD value (descending)
  - Show token logo (if available)
- **Success Criteria:** All balances accurate; USD values current; total calculations correct

**FR-WALLET-002: Wallet Address Management**
- **Copy Address:**
  - Click 📋 button to copy full address
  - Show confirmation toast: "✅ Address copied!"
- **Show QR Code:**
  - Long-press address to generate QR code
  - Display QR with "Scan to send SOL" message
  - Include "Share QR" button
- **Success Criteria:** Copy works reliably; QR code generates correctly

**FR-WALLET-003: Balance Refresh**
- **Manual Refresh:**
  - User clicks "🔄 Refresh"
  - Show loading: "Fetching balances..."
  - Update all token balances from blockchain
  - Show success message and new timestamp
- **Auto-refresh:** Every 2 minutes in background when wallet view is active
- **Rate Limiting:** Max 1 manual refresh per 30 seconds
- **Success Criteria:** Refresh completes within 5 seconds; handles RPC errors gracefully

**FR-WALLET-004: Send Tokens**
- **Trigger:** User clicks "💸 Send" button
- **Step 1 - Token Selection:**
  ```
  💸 Send Tokens
  Select token to send:
  
  [🪙 SOL - 12.450]
  [💵 USDC - 500.00]
  [💵 USDT - 250.00]
  [... other tokens]
  
  [« Cancel]
  ```
- **Step 2 - Recipient Address:**
  - Prompt: "Enter recipient's Solana address:"
  - Validate: Check address format (base58, correct length)
  - If invalid: "❌ Invalid Solana address. Please try again."
  - Option to scan QR code
- **Step 3 - Amount:**
  - Prompt: "How much [TOKEN] to send?"
  - Show available balance: "Available: [amount]"
  - Preset buttons: [25%] [50%] [75%] [Max]
  - Custom input field
  - Reserve gas for SOL sends (0.01 SOL buffer)
- **Step 4 - Confirmation:**
  ```
  💸 Confirm Send
  ─────────────────────────
  From: [Your Address]
  To: [Recipient Address] 📋
  
  Amount: 5.0 SOL
  USD Value: ~$500.00
  
  Transaction Fee: ~0.001 SOL
  
  Total Cost: 5.001 SOL ($500.10)
  
  [✅ Confirm Send] [❌ Cancel]
  ```
- **Execution:**
  1. Show loading: "⏳ Sending..."
  2. Submit transaction
  3. Wait for confirmation
  4. Success: "✅ Sent! Transaction: [link]"
- **Error Handling:**
  - Insufficient balance: Show exact shortfall
  - Invalid address: Clear error message
  - Transaction failed: Show reason and retry option
- **Success Criteria:** Sends complete successfully; confirmations prevent mistakes

**FR-WALLET-005: Transaction History**
- **Trigger:** User clicks "📜 History" button
- **Display:**
  ```
  📜 Transaction History
  
  Today
  ─────────────────────────
  ⬇️ Received 0.5 SOL
  From: [address]
  2 hours ago | [View] 🔗
  
  ⬆️ Sent 100 USDC
  To: [address]
  5 hours ago | [View] 🔗
  
  Yesterday
  ─────────────────────────
  ⚙️ Position Created
  SOL-USDC Pool
  1 day ago | [View] 🔗
  
  💸 Fees Claimed
  +$18.50 (SOL-USDC)
  1 day ago | [View] 🔗
  
  [Load More]
  ```
- **Transaction Types:**
  - ⬆️ Sent
  - ⬇️ Received
  - ⚙️ Position Created
  - ❌ Position Closed
  - 💸 Fees Claimed
  - 🔄 Rebalanced
- **Grouping:** Group by time (Today, Yesterday, This Week, This Month, Older)
- **Pagination:** Load 20 transactions per page
- **Filtering:** Filter by transaction type
- **Success Criteria:** All transactions shown; links work; types accurate

**FR-WALLET-006: Privy Wallet Connection**
- **Initial Connection (New Users):**
  ```
  🔐 Connect Your Wallet
  
  To use this bot, connect your wallet securely through Privy.
  
  ✅ Non-custodial
  ✅ Secure authentication
  ✅ Your keys, your crypto
  
  [🔗 Connect with Privy]
  [❓ What is Privy?]
  ```
- **Connection Flow:**
  1. User clicks "Connect with Privy"
  2. Bot generates Privy auth URL
  3. User opens URL in browser
  4. User authenticates via Privy (email/social/wallet)
  5. Privy creates/links wallet
  6. User returns to Telegram bot
  7. Bot verifies connection
  8. Success: "✅ Wallet connected!"
- **Success Criteria:** Connection flow smooth; wallet created/linked correctly; secure

**FR-WALLET-007: Wallet Disconnection**
- **Access:** Settings → Wallet → Disconnect
- **Warning:**
  ```
  ⚠️ Disconnect Wallet
  
  This will:
  • Remove wallet connection
  • Clear cached data
  • Log you out of bot
  
  Your positions will remain safe on-chain.
  You can reconnect anytime.
  
  Type 'DISCONNECT' to confirm:
  ```
- **Post-disconnect:** Return to welcome screen with "Connect Wallet" button
- **Success Criteria:** Disconnection secure; no data loss; easy to reconnect

**FR-WALLET-008: Token Hiding**
- **Purpose:** Hide dust/spam tokens from wallet view
- **Access:** Long-press on token in wallet view
- **Options:**
  - "👁️ Hide Token" → Removes from main view
  - "📌 Pin Token" → Keeps at top of list
- **Hidden Tokens:** Access via "Show Hidden" toggle at bottom
- **Success Criteria:** Tokens hide/show correctly; preferences persist

**User Flow (Send Tokens):**
1. User clicks "💰 Wallet"
2. Bot displays wallet overview
3. User clicks "💸 Send"
4. Bot shows token selection
5. User selects SOL
6. Bot prompts for recipient address
7. User pastes address
8. Bot validates address
9. Bot prompts for amount
10. User selects "50%" (5 SOL)
11. Bot shows confirmation with fees
12. User confirms send
13. If 2FA enabled: User enters 2FA code
14. Bot submits transaction
15. Transaction confirms
16. Bot shows success message with link
17. Wallet balance updates

**Error Handling:**
- Wallet not connected: Show "Connect Wallet" flow
- Balance fetch fails: Show cached balances with indicator
- RPC unavailable: Retry with fallback RPC
- Transaction fails: Clear error message with retry button

---

### 3.6 Settings & Help

**Purpose:** Allow users to configure bot preferences, manage security settings, and access help resources.

**Functional Requirements:**

**FR-SETTINGS-001: Settings Menu**
- **Trigger:** User clicks "⚙️ Settings" button or sends `/settings` command
- **Display:**
  ```
  ⚙️ Settings
  
  🔐 Security
  Two-factor Authentication: ❌ Disabled
  [⚙️ Manage 2FA]
  
  🔄 Auto-Rebalancing
  Default: ✅ Enabled
  Threshold: 20%
  [⚙️ Configure]
  
  🔔 Notifications
  Price Alerts: ✅ Enabled
  Position Updates: ✅ Enabled
  Fee Claims: ❌ Disabled
  [⚙️ Manage]
  
  🌐 Multi-DEX
  Enabled DEXes: Meteora
  [⚙️ Configure]
  
  👤 Account
  Username: @johndoe
  Wallet: Sol1x...xyz
  Member Since: Oct 1, 2025
  
  [💰 Wallet Settings]
  [📊 Export Data]
  [🔴 Disconnect Wallet]
  [« Back]
  ```
- **Success Criteria:** All settings display current state; navigation works

**FR-SETTINGS-002: Two-Factor Authentication Setup**
- **Trigger:** User clicks "⚙️ Manage 2FA"
- **Setup Flow (If Disabled):**
  ```
  🔐 Enable Two-Factor Authentication
  
  Add extra security for:
  • Creating positions
  • Closing positions
  • Claiming fees
  • Sending tokens
  
  Step 1: Install Authenticator App
  Recommended: Google Authenticator, Authy
  
  [✅ I have an app] [❓ Help]
  ```
- **Step 2:** Display QR code with secret key
  ```
  Scan this QR code in your authenticator app:
  
  [QR CODE]
  
  Or enter manually:
  JBSWY3DPEHPK3PXP
  
  [✅ I've scanned it]
  ```
- **Step 3:** Verification
  ```
  Enter the 6-digit code from your app to verify:
  
  [Code Input Field]
  
  [✅ Verify] [❌ Cancel]
  ```
- **Success:** "✅ 2FA enabled! Your account is now more secure."
- **Backup Codes:** Generate 10 backup codes: "Save these codes securely. Each can be used once if you lose access to your authenticator."
- **Success Criteria:** 2FA setup completes; codes work; backup codes generated

**FR-SETTINGS-003: 2FA Management (If Enabled)**
- **Display:**
  ```
  🔐 Two-Factor Authentication
  Status: ✅ Enabled
  
  [🔑 View Backup Codes]
  [🔄 Regenerate Codes]
  [❌ Disable 2FA]
  ```
- **Disable 2FA:**
  - Require 2FA code to disable: "Enter code to disable 2FA:"
  - After verification: "⚠️ Are you sure? Type 'DISABLE' to confirm:"
  - Success: "✅ 2FA disabled"
- **Success Criteria:** 2FA can be safely enabled/disabled; backup codes accessible

**FR-SETTINGS-004: Auto-Rebalancing Configuration**
- **Trigger:** User clicks "⚙️ Configure" in Auto-Rebalancing section
- **Display:**
  ```
  🔄 Auto-Rebalancing Settings
  
  Enable by default for new positions?
  [✅ Yes] [  No]
  
  Rebalancing Threshold:
  When position moves outside range by:
  • 10% (More frequent)
  ○ 20% (Balanced) ← Recommended
  ○ 30% (Less frequent)
  ○ 50% (Rare)
  
  Cost Threshold:
  Only rebalance if cost is less than:
  • 5% of position value
  ○ 10% of position value ← Default
  ○ 20% of position value
  
  Apply to Existing Positions?
  [  Apply to all] [  Keep individual settings]
  
  [💾 Save Changes] [❌ Cancel]
  ```
- **Success Criteria:** Settings save; apply to new positions; existing positions optionally updated

**FR-SETTINGS-005: Notification Preferences**
- **Trigger:** User clicks "⚙️ Manage" in Notifications section
- **Display:**
  ```
  🔔 Notification Settings
  
  Price Alerts:
  [✅] Position moves out of range
  [✅] Price drops 10% or more
  [  ] Price rises 10% or more
  
  Position Updates:
  [✅] Position created successfully
  [✅] Auto-rebalancing triggered
  [✅] Rebalancing completed
  [  ] Daily performance summary
  
  Fee & Rewards:
  [  ] Fees claimable (threshold: $10)
  [✅] Fees claimed successfully
  [✅] New rewards available
  
  System:
  [✅] Bot updates & maintenance
  [  ] Tips & best practices
  
  [💾 Save Preferences] [❌ Cancel]
  ```
- **Delivery:** All notifications sent via Telegram messages
- **Quiet Hours:** Option to set notification quiet hours
- **Success Criteria:** Notifications deliver according to preferences; can be enabled/disabled

**FR-SETTINGS-006: Multi-DEX Configuration**
- **Trigger:** User clicks "⚙️ Configure" in Multi-DEX section
- **Display:**
  ```
  🌐 Multi-DEX Settings
  
  Select which DEXes to display:
  
  [✅] Meteora (DLMM, DAMM)
  [  ] Orca (Concentrated, Whirlpools)
  [  ] Raydium (Standard AMM)
  [  ] Saros (DLMM)
  
  Coming Soon:
  [  ] Phoenix
  [  ] Lifinity
  
  This affects:
  • Trending pools display
  • Portfolio positions
  • Pool search results
  
  [💾 Save Changes] [❌ Cancel]
  ```
- **Future State:** When multiple DEXes supported, allow user to enable/disable each
- **Success Criteria:** DEX preferences save; filtering works correctly

**FR-SETTINGS-007: Data Export**
- **Trigger:** User clicks "📊 Export Data"
- **Display:**
  ```
  📊 Export Your Data
  
  Choose what to export:
  [✅] All positions (active & closed)
  [✅] Transaction history
  [✅] Fee earnings history
  [✅] Rebalancing events
  
  Format:
  ○ CSV (Excel-compatible)
  • JSON (Developer-friendly)
  
  [📥 Generate Export] [❌ Cancel]
  ```
- **Generation:**
  1. Show loading: "⏳ Generating export..."
  2. Create export file with selected data
  3. Upload file to Telegram
  4. "✅ Export ready! File sent above."
- **Privacy:** Export only includes user's own data
- **Success Criteria:** Export generates correctly; file opens in standard apps

**FR-SETTINGS-008: Help Menu**
- **Trigger:** User clicks "❓ Help" button or sends `/help` command
- **Display:**
  ```
  ❓ Help & Support
  
  📚 Guides
  [🎓 Getting Started]
  [📖 Creating Positions]
  [💡 Understanding Strategies]
  [🔄 Auto-Rebalancing Guide]
  [💸 Fees & Rewards]
  [🔐 Security Best Practices]
  
  🆘 Support
  [💬 Contact Support]
  [🐛 Report Bug]
  [💡 Request Feature]
  [📊 Bot Status]
  
  ℹ️ About
  [📜 Terms of Service]
  [🔒 Privacy Policy]
  [📱 Follow Us]
  Version: 1.0.0
  
  [« Back]
  ```
- **Success Criteria:** All help resources accessible; links work

**FR-SETTINGS-009: Getting Started Guide**
- **Trigger:** User clicks "🎓 Getting Started"
- **Content:** Multi-page interactive tutorial
  ```
  🎓 Getting Started Guide (1/5)
  
  Welcome to Meteora Liquidity Bot!
  
  This bot helps you provide liquidity on Solana DEXes and earn fees—all from Telegram.
  
  No complex dashboards. No desktop required.
  Just simple buttons and clear guidance.
  
  [Next →]
  
  ─────
  Page 2/5: What is Liquidity Provision?
  Page 3/5: Creating Your First Position
  Page 4/5: Managing Positions
  Page 5/5: Tips for Success
  ```
- **Features:**
  - Progress indicator (1/5, 2/5, etc.)
  - Navigation: Previous/Next buttons
  - Skip option: "Skip Tutorial"
  - Bookmark: "Resume Later"
- **Success Criteria:** Tutorial clear and educational; navigation smooth

**FR-SETTINGS-010: Contact Support**
- **Trigger:** User clicks "💬 Contact Support"
- **Display:**
  ```
  💬 Contact Support
  
  How can we help?
  
  [🐛 Technical Issue]
  [❓ General Question]
  [💡 Feature Request]
  [📊 Account Issue]
  
  You can also:
  • Join our Telegram group: [Link]
  • Email us: support@example.com
  • Check FAQs: [Link]
  
  [« Back]
  ```
- **Issue Reporting:**
  - Prompt: "Describe your issue:"
  - User types description
  - Bot collects diagnostic data (wallet address, last action, error logs)
  - Creates support ticket
  - Confirmation: "✅ Ticket #12345 created. We'll respond within 24h."
- **Success Criteria:** Support requests submitted successfully; ticket tracking works

**FR-SETTINGS-011: Bot Status Page**
- **Trigger:** User clicks "📊 Bot Status"
- **Display:**
  ```
  📊 Bot Status
  
  System Status: ✅ All systems operational
  
  Services:
  ✅ Telegram Bot
  ✅ Solana RPC
  ✅ Database
  ✅ Meteora API
  ⚠️ Jupiter API (Degraded)
  
  Current Load:
  Active Users: 1,247
  Positions Managed: 3,592
  Transactions Today: 156
  
  Response Times:
  Position Creation: 3.2s avg
  Portfolio Load: 1.8s avg
  Balance Refresh: 2.1s avg
  
  Last Updated: 2 mins ago
  
  [🔄 Refresh Status]
  [📊 Status Page] (external link)
  ```
- **Auto-refresh:** Update every 60 seconds
- **Incident Notifications:** If status changes to degraded/down, notify all users
- **Success Criteria:** Accurate status reporting; external status page accessible

**User Flow (Enable 2FA):**
1. User clicks "⚙️ Settings"
2. Bot displays settings menu
3. User clicks "⚙️ Manage 2FA"
4. Bot shows 2FA setup guide
5. User confirms they have authenticator app
6. Bot displays QR code and secret key
7. User scans QR in authenticator app
8. Bot prompts for verification code
9. User enters 6-digit code
10. Bot verifies code
11. Bot generates backup codes
12. User saves backup codes
13. Bot confirms "✅ 2FA enabled!"
14. User returns to settings menu

**Error Handling:**
- Invalid 2FA code: "❌ Invalid code. Please try again. (2 attempts remaining)"
- 2FA timeout: "⏱️ Setup timed out. Please try again."
- Export generation fails: "❌ Export failed. Please try again later."
- Support ticket fails: "❌ Unable to submit ticket. Please email support@example.com"

---

## 4. Non-Functional Requirements

### 4.1 Performance

**NFR-PERF-001: Response Time**
- Command responses: < 2 seconds for 95% of requests
- Position creation: < 10 seconds end-to-end
- Portfolio load: < 3 seconds for up to 20 positions
- Balance refresh: < 5 seconds
- Transaction confirmation: < 30 seconds (blockchain dependent)

**NFR-PERF-002: Scalability**
- Support 10,000+ concurrent users
- Handle 1,000+ position creations per day
- Process 100+ portfolio refreshes per minute
- Database queries optimized for < 500ms response time

**NFR-PERF-003: Availability**
- 99.5% uptime (excluding planned maintenance)
- Maximum 4 hours downtime per month
- Degraded mode if external services fail (cached data, read-only)

### 4.2 Security

**NFR-SEC-001: Authentication**
- Telegram user ID verification for all requests
- Privy wallet integration for secure key management
- Optional 2FA for sensitive operations
- Session timeout: 24 hours of inactivity

**NFR-SEC-002: Data Protection**
- Private keys never stored in bot database
- Wallet keys encrypted with Privy's secure enclave
- User data encrypted at rest (AES-256)
- TLS 1.3 for all external communications

**NFR-SEC-003: Transaction Security**
- User approval required for all transactions
- Transaction simulation before submission (when possible)
- Slippage protection on all swaps
- Gas estimation with 10% buffer
- Transaction signature verification

**NFR-SEC-004: Rate Limiting**
- 10 commands per minute per user
- 1 position creation per 30 seconds per user
- 1 refresh per 30 seconds per endpoint
- Exponential backoff for failed requests

### 4.3 Reliability

**NFR-REL-001: Error Handling**
- Graceful degradation when external services fail
- Automatic retry for transient errors (max 3 attempts)
- Clear, actionable error messages for users
- No silent failures—always inform user of issues

**NFR-REL-002: Data Consistency**
- Position data synced with blockchain state
- Reconciliation job runs every 10 minutes
- Transaction confirmation monitoring
- Automatic refresh after blockchain state changes

**NFR-REL-003: Backup & Recovery**
- Database backups every 6 hours
- 30-day backup retention
- Point-in-time recovery capability
- Disaster recovery plan tested quarterly

### 4.4 Usability

**NFR-USE-001: Mobile-First Design**
- All features accessible on mobile Telegram clients
- Buttons sized for touch interaction (min 44x44 px)
- Text readable without zooming (min 14pt font)
- No horizontal scrolling required

**NFR-USE-002: Accessibility**
- Clear button labels with emojis for visual scanning
- Consistent navigation patterns
- Breadcrumb navigation for complex flows
- Confirmation dialogs for destructive actions

**NFR-USE-003: Internationalization (Future)**
- Initial launch: English only
- Architecture supports multi-language (i18n ready)
- Currency display respects user locale
- Date/time formatting per user timezone

### 4.5 Maintainability

**NFR-MAIN-001: Code Quality**
- TypeScript strict mode enabled
- ESLint rules enforced
- Minimum 80% test coverage
- All functions documented with TSDoc comments

**NFR-MAIN-002: Monitoring & Logging**
- Structured logging with correlation IDs
- Real-time error alerting (PagerDuty/similar)
- Performance metrics tracked (response times, error rates)
- User analytics (feature usage, conversion funnels)

**NFR-MAIN-003: Deployment**
- Zero-downtime deployments
- Feature flags for gradual rollouts
- Rollback capability within 5 minutes
- Automated CI/CD pipeline

---

## 5. User Flows

### 5.1 Complete Flow: New User Onboarding

**Actors:** New User (never used bot before)

**Preconditions:** User has Telegram account

**Steps:**
1. User finds bot via invite link or search
2. User clicks "Start" or sends `/start`
3. Bot displays welcome message: "Welcome to Meteora Liquidity Bot! 👋"
4. Bot explains bot purpose and features briefly
5. Bot prompts: "To get started, connect your wallet securely via Privy"
6. User clicks "🔗 Connect Wallet"
7. Bot generates Privy authentication URL
8. User opens URL in browser
9. User authenticates via Privy (email/social login)
10. Privy creates embedded wallet or links existing wallet
11. User returns to Telegram bot
12. Bot detects successful connection
13. Bot creates user profile in database
14. Bot displays success: "✅ Wallet connected! Address: Sol1x...xyz"
15. Bot fetches initial SOL balance
16. Bot displays main menu with navigation options
17. Bot shows optional onboarding tutorial prompt: "👋 New here? Take a quick tour!"
18. User either starts tutorial or explores features

**Postconditions:**
- User profile created in database
- Wallet linked via Privy
- User can access all bot features

**Alternative Flows:**
- 9a. User already has Privy account → Auto-links existing wallet
- 9b. Privy authentication fails → Retry flow with error message
- 17a. User skips tutorial → Can access later via Help menu

### 5.2 Complete Flow: Create First Position from Trending

**Actors:** Authenticated User

**Preconditions:** User has connected wallet, has SOL balance > 0.1

**Steps:**
1. User clicks "🔥 Trending" from main menu
2. Bot fetches trending pools from Meteora
3. Bot displays top 10 pools sorted by Fee/TVL ratio
4. User browses list, sees SOL-USDC pool with 45% APY
5. User clicks "📈 Details" on SOL-USDC pool
6. Bot displays detailed pool information
7. User reviews APY, TVL, and fees
8. User clicks "➕ Open Position"
9. Bot launches position creation wizard
10. Bot displays pool info and asks: "Choose your position strategy:"
11. User sees options: Spot (Recommended), Curve, Bid-Ask
12. User clicks "🎯 Spot (Recommended)"
13. Bot asks: "How would you like to deposit liquidity?"
14. User sees: "💱 SOL Auto-convert (Easiest)" and "🎯 Single-sided Token"
15. User clicks "💱 SOL Auto-convert"
16. Bot asks: "How much would you like to deposit?"
17. Bot shows percentage options: 25%, 50%, 75%, 100%, Custom
18. User clicks "50% of Balance" (5 SOL)
19. Bot asks: "Enable automatic rebalancing?"
20. User sees: "✅ Yes (Recommended)" and "❌ No"
21. User clicks "✅ Yes (Recommended)"
22. Bot shows complete position summary:
    - Pool: SOL-USDC
    - Strategy: Spot
    - Deposit: 5 SOL
    - Auto-rebalance: Yes (20% threshold)
    - Estimated composition and fees
23. User reviews summary
24. User clicks "✅ Confirm & Create"
25. Bot shows loading: "⏳ Creating your position..."
26. Bot builds transaction instructions
27. Bot requests wallet signature via Privy
28. User approves transaction in Privy modal
29. Bot submits transaction to Solana blockchain
30. Bot shows progress: "Submitting to blockchain... ⏳"
31. Bot monitors transaction confirmation
32. Transaction confirms on-chain
33. Bot creates position record in database
34. Bot shows success message: "✅ Position Created Successfully!"
35. Bot displays transaction link and position details
36. User clicks "📊 View Position"
37. Bot displays detailed position view
38. Bot starts background monitoring for this position

**Postconditions:**
- Position created on-chain
- Position record in database
- User's wallet balance reduced
- Background monitoring active

**Alternative Flows:**
- 28a. User rejects signature → Transaction cancelled, no funds transferred
- 32a. Transaction fails → Error shown with retry option
- 32b. Slippage exceeded → User notified, prompted to try again with higher slippage

### 5.3 Complete Flow: Claim Fees and Close Position

**Actors:** User with active position

**Preconditions:** User has active position with claimable fees

**Steps:**
1. User clicks "📊 Portfolio" from main menu
2. Bot displays portfolio overview with all positions
3. User sees SOL-USDC position with $18.50 unclaimed fees
4. User clicks "📊 Details" on SOL-USDC position
5. Bot displays detailed position information:
   - Current value, P&L, fees breakdown
6. User sees: Unclaimed Fees: $18.50 (0.012 SOL + 17.30 USDC)
7. User clicks "💸 Claim Fees"
8. Bot shows fee claim confirmation:
   - Detailed fee breakdown
   - Transaction cost estimate
9. User clicks "✅ Confirm Claim"
10. If 2FA enabled: Bot prompts for 2FA code
11. User enters 6-digit 2FA code
12. Bot verifies 2FA code
13. Bot shows loading: "⏳ Claiming fees..."
14. Bot builds claim transaction
15. Bot requests wallet signature
16. User approves transaction
17. Bot submits claim transaction
18. Transaction confirms on-chain
19. Fees transferred to user wallet
20. Bot updates position record (fees claimed)
21. Bot shows success: "✅ Fees claimed! Transaction: [link]"
22. Bot displays updated position details (fees now $0)
23. User reviews performance, decides to close position
24. User clicks "❌ Close Position"
25. Bot shows close confirmation with warnings:
    - "⚠️ This action cannot be undone"
    - Final P&L summary
    - Estimated tokens to receive
26. User clicks "⚠️ Yes, Close Position"
27. Bot asks for second confirmation: "Type 'CLOSE' to confirm"
28. User types "CLOSE"
29. Bot validates confirmation text
30. Bot shows loading: "⏳ Closing position..."
31. Bot builds close position transaction
32. Bot requests wallet signature
33. User approves transaction
34. Bot submits close transaction
35. Transaction confirms on-chain
36. All liquidity + remaining fees transferred to wallet
37. Bot updates position status to "CLOSED"
38. Bot shows success message with final summary:
    - Initial investment
    - Final value
    - Total P&L
    - Total fees earned
    - Duration
39. Bot prompts: "Rate your experience with this position:"
40. User rates 1-5 stars (optional)
41. Bot thanks user and returns to portfolio
42. Closed position moved to history

**Postconditions:**
- Fees claimed to wallet
- Position closed on-chain
- Position status updated to CLOSED
- Liquidity returned to wallet
- Background monitoring stopped

**Alternative Flows:**
- 12a. Invalid 2FA code → Retry with remaining attempts
- 18a. Claim transaction fails → Retry option provided
- 29a. Wrong confirmation text → User prompted again
- 35a. Close transaction fails → Position remains open, error shown with retry

### 5.4 Complete Flow: Auto-Rebalancing Triggered

**Actors:** System (automated), User (notification recipient)

**Preconditions:**
- User has active position with auto-rebalancing enabled
- Price moved outside range by more than threshold (20%)

**Steps:**
1. Background job runs every 5 minutes
2. Job fetches all active positions with auto-rebalancing enabled
3. For each position, job checks current price vs. position range
4. Job detects SOL-USDC position: Price 115.2, Range 97.4-107.6
5. Price deviation calculated: 7.1% above upper bound
6. Threshold check: 7.1% < 20% → No rebalancing yet
7. (Time passes, price continues rising)
8. Background job runs again 1 hour later
9. Job detects price now 125.5, deviation 16.6% above upper bound
10. Threshold check: 16.6% < 20% → No rebalancing yet
11. (Price continues rising)
12. Background job runs again 30 minutes later
13. Job detects price now 132.8, deviation 23.5% above upper bound
14. Threshold check: 23.5% > 20% → Rebalancing triggered!
15. Job calculates rebalancing costs (fees + slippage)
16. Job checks cost vs. position value: $12.50 cost vs. $5,000 value = 0.25%
17. Cost check passes (< 10% threshold)
18. Job sends notification to user:
    ```
    🔄 Auto-Rebalancing Triggered
    
    Position: SOL-USDC
    Reason: Price moved 23.5% outside range
    
    Your position will be rebalanced automatically.
    
    [📊 View Details] [⏸️ Pause Auto-Rebalance]
    ```
19. Job begins rebalancing process:
20. Job builds close position transaction
21. Job requests wallet signature via Privy (delegated access for auto-operations)
22. Transaction submitted to blockchain
23. Old position closed
24. Job claims all fees automatically
25. Job calculates optimal new range centered on current price
26. Job builds create position transaction with same total value
27. Transaction submitted to blockchain
28. New position created
29. Both transactions confirm on-chain
30. Job updates database:
    - Old position marked as rebalanced
    - New position created with continuity reference
    - Rebalance event recorded with costs and P&L
31. Job sends success notification to user:
    ```
    ✅ Position Rebalanced Successfully
    
    SOL-USDC position is now back in optimal range!
    
    Old Range: 97.4 - 107.6 USDC/SOL
    New Range: 119.0 - 146.0 USDC/SOL
    Current Price: 132.8 USDC/SOL
    
    Rebalancing Cost: $12.50
    Fees Claimed: $18.50
    Net Benefit: +$6.00
    
    [📊 View Position]
    ```
32. User receives notification
33. User optionally clicks "View Position" to see details

**Postconditions:**
- Old position closed
- New position created
- Position back in optimal range
- Rebalance event recorded
- User notified of completion

**Alternative Flows:**
- 17a. Cost too high (>10% of position) → Skip rebalancing, notify user to manually review
- 22a. Close transaction fails → Retry up to 3 times, then notify user of failure
- 27a. Create transaction fails → Attempt recovery, worst case: funds in wallet, notify user
- User clicks "Pause Auto-Rebalance" in notification → Rebalancing cancelled, auto-rebalance disabled for position

---

## 6. Success Criteria

### 6.1 Feature-Level Success Criteria

**Start Interface:**
- ✅ 100% of authenticated users can access main menu
- ✅ Wallet balance displays correctly for 99%+ of requests
- ✅ Navigation buttons work in < 2 seconds

**Trending Tokens:**
- ✅ Trending pools list loads within 3 seconds
- ✅ All pool data accuracy verified against DEX APIs
- ✅ 80%+ of users engage with trending list in first session

**Position Creation:**
- ✅ 95%+ success rate for position creation transactions
- ✅ Average time from start to confirmation < 2 minutes
- ✅ User completes 70%+ of started position creation flows

**Portfolio Management:**
- ✅ Portfolio loads within 3 seconds for up to 20 positions
- ✅ P&L calculations accurate to 2 decimal places
- ✅ Users check portfolio average 3+ times per week

**Wallet Management:**
- ✅ Balance refresh completes within 5 seconds
- ✅ Token send success rate > 98%
- ✅ Zero incidents of lost funds due to bot errors

**Settings & Help:**
- ✅ 2FA setup completion rate > 60% when attempted
- ✅ Help resources accessed by 50%+ of new users
- ✅ Average support response time < 24 hours

### 6.2 User Experience Success Criteria

- ✅ New user completes first position within 10 minutes of signup
- ✅ User satisfaction score (CSAT) > 4.5/5.0
- ✅ Net Promoter Score (NPS) > 50
- ✅ < 5% user churn rate after first successful position
- ✅ Average session length > 5 minutes
- ✅ Users create 2+ positions within first month

### 6.3 Business Success Criteria

- ✅ 1,000+ active users within 3 months of launch
- ✅ $1M+ total value locked (TVL) across all users
- ✅ 50+ daily position creations at steady state
- ✅ 60%+ monthly active user retention
- ✅ 10%+ month-over-month user growth
- ✅ Average position value > $500

### 6.4 Technical Success Criteria

- ✅ 99.5%+ uptime (excluding planned maintenance)
- ✅ 95th percentile response time < 3 seconds
- ✅ Zero critical security incidents
- ✅ Database query performance < 500ms p95
- ✅ Transaction confirmation monitoring 100% reliable
- ✅ Automated test coverage > 80%

---

## 7. Future Considerations

### 7.1 Multi-DEX Expansion

**Phase 2: Orca Integration**
- Timeline: 3 months after Meteora launch
- Features: Whirlpools support, concentrated liquidity
- Unified interface: Same UX across both DEXes
- Portfolio aggregation: Combine Meteora + Orca positions

**Phase 3: Raydium Integration**
- Timeline: 6 months after Meteora launch
- Features: Standard AMM pools, CPMM support
- Strategy differences: Adjust UI for AMM vs. DLMM

**Phase 4: Saros Integration**
- Timeline: 9 months after Meteora launch
- Features: DLMM support, leverage existing patterns
- Cross-DEX comparison: Show best pools across all DEXes

**Architectural Considerations:**
- Abstract DEX operations behind common interface
- Strategy pattern for DEX-specific logic
- Unified pool and position data models
- DEX registry for dynamic loading
- Feature flags for gradual DEX rollout

### 7.2 Advanced Features

**Liquidity Mining & Rewards:**
- Track reward tokens from incentivized pools
- Auto-claim rewards based on threshold
- Display reward APR separate from fee APR

**Portfolio Analytics:**
- Historical performance charts (weekly, monthly)
- Impermanent loss calculator and tracking
- Tax reporting export (CSV for accountants)
- Performance comparison vs. holding tokens

**Social Features:**
- Share position snapshots as images
- Leaderboards (opt-in, privacy-respecting)
- Copy trading: follow top performers' positions
- Social proof: "1,234 users in this pool"

**Advanced Strategies:**
- Limit orders (buy/sell at specific price)
- DCA into positions over time
- Multi-pool strategies (diversification)
- Risk-adjusted portfolio optimization

**Smart Notifications:**
- Price alerts for specific tokens
- Large position movements (whales)
- New high-APY pools detected
- Unusual fee earnings (anomaly detection)

### 7.3 Integrations

**External Wallets:**
- Support Phantom, Solflare direct connection
- Ledger hardware wallet support
- Multi-wallet management (switch between wallets)

**Price Data Providers:**
- Integrate Birdeye, CoinGecko for price feeds
- Redundant pricing for reliability
- Historical price charts in position details

**Analytics Platforms:**
- Integrate with DeFiLlama for TVL tracking
- Step Finance integration for portfolio overview
- Export positions to external portfolio trackers

### 7.4 Platform Expansion

**Web Dashboard:**
- Complementary web interface for desktop users
- Same account, synced data
- Advanced charting and analytics
- Bulk operations (manage multiple positions)

**Mobile App:**
- Native iOS/Android apps (post-MVP)
- Push notifications (more reliable than Telegram)
- Biometric authentication
- Offline mode with cached data

**Discord Bot:**
- Mirror functionality in Discord
- Serve users in Discord communities
- Shared backend with Telegram bot

### 7.5 Governance & Tokenomics

**Potential Future Token:**
- Bot usage rewards (points → token)
- Staking for premium features
- Governance voting on feature priorities
- Fee discounts for token holders

**Premium Tier:**
- Higher position limits (20+ positions)
- Priority support
- Advanced analytics
- Early access to new DEXes

---

## 8. Appendix

### 8.1 Glossary

- **APR (Annual Percentage Rate):** Simple interest rate earned per year
- **APY (Annual Percentage Yield):** Compound interest rate earned per year
- **DLMM (Dynamic Liquidity Market Maker):** Meteora's bin-based liquidity model
- **DEX (Decentralized Exchange):** Peer-to-peer cryptocurrency exchange
- **Fee/TVL Ratio:** Metric showing pool profitability (fees earned / total value locked)
- **IL (Impermanent Loss):** Temporary loss from price divergence in LP positions
- **LP (Liquidity Provider):** User providing liquidity to a pool
- **Position:** User's liquidity provision in a specific pool
- **Privy:** Wallet-as-a-service provider for secure key management
- **Rebalancing:** Adjusting position range to maintain optimal fee earnings
- **Slippage:** Difference between expected and actual trade execution price
- **TVL (Total Value Locked):** Total USD value of liquidity in a pool

### 8.2 Assumptions

1. Users have basic understanding of cryptocurrencies
2. Users trust Telegram as secure communication platform
3. Solana network maintains reasonable transaction costs (< $1 per transaction)
4. Meteora API remains stable and accessible
5. Privy service maintains 99.9%+ uptime
6. Users primarily access bot via mobile Telegram clients
7. Majority of users prefer English language (Phase 1)

### 8.3 Dependencies

**External Services:**
- Telegram Bot API
- Privy Wallet Authentication
- Solana RPC nodes (mainnet-beta)
- Meteora API (DLMM pools, position data)
- Jupiter API (token prices, swap routes)
- PostgreSQL database
- Redis (job queues, caching)

**Third-party Libraries:**
- Telegraf (Telegram bot framework)
- Solana Web3.js
- Anchor framework
- Drizzle ORM
- BullMQ

### 8.4 Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| Smart contract exploit | High | Low | Use audited protocols only; no custom contracts |
| Privy service outage | High | Low | Graceful degradation; cached data; status page |
| Solana network congestion | Medium | Medium | Priority fees; transaction retry logic; user communication |
| Meteora API downtime | Medium | Low | Caching layer; fallback to on-chain data |
| User wallet compromise | High | Low | 2FA for sensitive operations; security education |
| Regulatory changes | Medium | Low | Monitor regulations; Terms of Service updates |
| Low user adoption | Medium | Medium | Marketing; referral program; excellent UX |
| Database failure | High | Low | Regular backups; replica database; fast recovery |

---

**Document Status:** Ready for Review  
**Next Steps:**
1. Review and approve PRD
2. Create System Design document
3. Begin technical implementation
4. Set up monitoring and analytics
5. Prepare for beta testing

---

*This document is a living document and will be updated as requirements evolve and new features are prioritized.*
