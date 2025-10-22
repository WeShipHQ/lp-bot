/**
 * COMPLETE POSITION LIFECYCLE EXAMPLE
 *
 * This demonstrates the full lifecycle of a position:
 * 1. User creates position
 * 2. Bot monitors and auto-rebalances twice
 * 3. User manually claims fees
 * 4. User closes position
 *
 * Throughout, we track cumulative PnL correctly.
 */

import {
  createPosition,
  claimFees,
  rebalancePosition,
  closePosition,
  calculateCurrentPnL,
  getPositionHistory,
} from "./position-helpers";

// ============================================================================
// STEP 1: USER CREATES POSITION
// ============================================================================

async function step1_createPosition() {
  console.log("=== STEP 1: Creating Position ===\n");

  const { position, segment } = await createPosition({
    userId: "user-123",
    positionAddress: "pos1_ABC123",
    poolAddress: "pool_SOL_USDC",
    strategyType: "SPOT",
    tokenX: {
      symbol: "SOL",
      mint: "So11111111111111111111111111111111111111112",
      decimals: 9,
    },
    tokenY: {
      symbol: "USDC",
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
    },
    initialValueUSD: "1000.00",
    initialValueSOL: "10.0",
    initialTokenXAmount: "5.0",
    initialTokenYAmount: "500.0",
    initialTokenXPriceUSD: "100.00",
    initialTokenYPriceUSD: "1.00",
    isRebalancingEnabled: true,
    rebalanceThreshold: "20.0",
    tpPercentage: "50.0", // Close if +50% profit
    slPercentage: "20.0", // Close if -20% loss
    creationSignature: "sig_creation_001",
  });

  console.log("Position created:");
  console.log(`- ID: ${position.id}`);
  console.log(`- Address: ${position.positionAddress}`);
  console.log(`- Initial Value: $${position.initialValueUSD}`);
  console.log(`- Segment Number: ${position.currentSegmentNumber}`);
  console.log(
    `- Rebalancing: ${position.isRebalancingEnabled ? "Enabled" : "Disabled"}`
  );
  console.log("\n");

  return position.id;
}

// ============================================================================
// STEP 2: POSITION GROWS, BOT AUTO-REBALANCES (First Time)
// ============================================================================

async function step2_firstRebalance(positionId: string) {
  console.log("=== STEP 2: First Auto-Rebalance ===");
  console.log("Price moved out of range. Bot auto-rebalancing...\n");

  // Simulate: Position grew from $1000 to $1150 (15% gain)
  // Plus $50 in unclaimed fees
  // Total current value: $1150 + $50 = $1200

  const result = await rebalancePosition({
    positionId,
    triggerReason: "out_of_range",
    oldPositionAddress: "pos1_ABC123",
    newPositionAddress: "pos2_DEF456",

    // Segment 1 closure data
    segmentFinalValueUSD: "1200.00", // $1150 position + $50 fees

    // Fees collected during rebalance
    feesCollectedUSD: "50.00",
    claimedTokenXAmount: "0.25", // 0.25 SOL
    claimedTokenYAmount: "25.0", // 25 USDC
    tokenXPriceUSD: "100.00",
    tokenYPriceUSD: "1.00",

    // New segment initial value (after rebalance)
    newSegmentInitialUSD: "1200.00",

    // Transaction signatures
    closeTransactionSignature: "sig_close_001",
    createTransactionSignature: "sig_create_002",

    // Costs
    totalGasCostSOL: "0.01",
    slippageCostUSD: "5.00",
  });

  console.log("Rebalance completed:");
  console.log(
    `- Segment 1 PnL: $${result.segmentPnlUSD} (${result.segmentPnlPercentage}%)`
  );
  console.log(`- Fees collected: $50.00`);
  console.log(`- New position address: pos2_DEF456`);
  console.log(`- New segment number: 2`);
  console.log(`- New segment initial value: $1200.00`);
  console.log("\n");

  // Check cumulative PnL after rebalance
  const pnl = await calculateCurrentPnL(positionId, "1200.00", "0.00");
  console.log("Cumulative PnL after rebalance:");
  console.log(`- Realized PnL: $${pnl.realizedPnlUSD}`);
  console.log(`- Fees claimed: $${pnl.feesClaimedUSD}`);
  console.log(`- Total PnL: $${pnl.totalPnlUSD} (${pnl.totalPnlPercentage}%)`);
  console.log("\n");
}

// ============================================================================
// STEP 3: POSITION CONTINUES GROWING, ACCUMULATES MORE FEES
// ============================================================================

async function step3_manualClaimFees(positionId: string) {
  console.log("=== STEP 3: User Manually Claims Fees ===");
  console.log(
    "User decides to claim accumulated fees without closing position...\n"
  );

  // Position grew from $1200 to $1350
  // Accumulated $75 in new fees
  // User claims the $75 in fees

  const result = await claimFees({
    positionId,
    claimType: "MANUAL",
    claimedTokenXAmount: "0.375", // 0.375 SOL at $100 = $37.50
    claimedTokenYAmount: "37.50", // 37.50 USDC = $37.50
    tokenXPriceUSD: "100.00",
    tokenYPriceUSD: "1.00",
    transactionSignature: "sig_claim_001",
  });

  console.log("Fees claimed:");
  console.log(`- Amount: $${result.claimedUSDValue}`);
  console.log(`- Position remains open`);
  console.log("\n");

  // Check cumulative PnL after manual claim
  const pnl = await calculateCurrentPnL(positionId, "1350.00", "0.00");
  console.log("Cumulative PnL after fee claim:");
  console.log(`- Current value: $${pnl.currentValueUSD}`);
  console.log(`- Unrealized PnL: $${pnl.unrealizedPnlUSD}`);
  console.log(`- Realized PnL: $${pnl.realizedPnlUSD}`);
  console.log(`- Fees claimed: $${pnl.feesClaimedUSD}`);
  console.log(`- Total PnL: $${pnl.totalPnlUSD} (${pnl.totalPnlPercentage}%)`);
  console.log("\n");
}

// ============================================================================
// STEP 4: PRICE MOVES AGAIN, BOT REBALANCES (Second Time)
// ============================================================================

async function step4_secondRebalance(positionId: string) {
  console.log("=== STEP 4: Second Auto-Rebalance ===");
  console.log("Price moved out of range again. Bot auto-rebalancing...\n");

  // Position grew from $1350 to $1450 (segment gain)
  // Plus $25 in new unclaimed fees
  // Total: $1475

  const result = await rebalancePosition({
    positionId,
    triggerReason: "out_of_range",
    oldPositionAddress: "pos2_DEF456",
    newPositionAddress: "pos3_GHI789",

    // Segment 2 closure data
    segmentFinalValueUSD: "1475.00",

    // Fees collected during rebalance
    feesCollectedUSD: "25.00",
    claimedTokenXAmount: "0.125",
    claimedTokenYAmount: "12.50",
    tokenXPriceUSD: "100.00",
    tokenYPriceUSD: "1.00",

    // New segment initial value
    newSegmentInitialUSD: "1475.00",

    // Transaction signatures
    closeTransactionSignature: "sig_close_002",
    createTransactionSignature: "sig_create_003",

    // Costs
    totalGasCostSOL: "0.01",
    slippageCostUSD: "5.00",
  });

  console.log("Second rebalance completed:");
  console.log(
    `- Segment 2 PnL: $${result.segmentPnlUSD} (${result.segmentPnlPercentage}%)`
  );
  console.log(`- Fees collected: $25.00`);
  console.log(`- New position address: pos3_GHI789`);
  console.log(`- New segment number: 3`);
  console.log("\n");

  // Check cumulative PnL
  const pnl = await calculateCurrentPnL(positionId, "1475.00", "0.00");
  console.log("Cumulative PnL after second rebalance:");
  console.log(`- Realized PnL: $${pnl.realizedPnlUSD}`);
  console.log(`- Fees claimed: $${pnl.feesClaimedUSD}`);
  console.log(`- Total PnL: $${pnl.totalPnlUSD} (${pnl.totalPnlPercentage}%)`);
  console.log("\n");
}

// ============================================================================
// STEP 5: USER CLOSES POSITION
// ============================================================================

async function step5_closePosition(positionId: string) {
  console.log("=== STEP 5: User Closes Position ===");
  console.log("User decides to close position and realize all gains...\n");

  // Current position value: $1550
  // Unclaimed fees: $40
  // Total to withdraw: $1590

  const result = await closePosition({
    positionId,
    finalValueUSD: "1550.00",
    finalValueSOL: "15.5",
    finalTokenXAmount: "7.75",
    finalTokenYAmount: "775.0",
    finalTokenXPriceUSD: "100.00",
    finalTokenYPriceUSD: "1.00",
    closureSignature: "sig_close_final",

    // Claim remaining fees on closure
    claimedTokenXAmount: "0.20",
    claimedTokenYAmount: "20.0",

    closureReason: "user_close",
  });

  console.log("Position closed:");
  console.log(`- Final value: $${result.finalValueUSD}`);
  console.log(`- Total fees claimed: $${result.totalFeesClaimedUSD}`);
  console.log(
    `- Total PnL: $${result.totalPnlUSD} (${result.totalPnlPercentage}%)`
  );
  console.log("\n");

  console.log("=== BREAKDOWN ===");
  console.log(`- Initial investment: $1000.00`);
  console.log(`- Final value: $${result.finalValueUSD}`);
  console.log(`- Value gain: $${parseFloat(result.finalValueUSD) - 1000}`);
  console.log(`- Total fees earned: $${result.totalFeesClaimedUSD}`);
  console.log(
    `- Total return: $${result.totalPnlUSD} (${result.totalPnlPercentage}%)`
  );
  console.log("\n");
}

// ============================================================================
// STEP 6: VIEW COMPLETE HISTORY
// ============================================================================

async function step6_viewHistory(positionId: string) {
  console.log("=== STEP 6: Position History ===\n");

  const history = await getPositionHistory(positionId);

  console.log("Position Summary:");
  console.log(`- Created: ${history.position?.createdAt}`);
  console.log(`- Closed: ${history.position?.closedAt}`);
  console.log(`- Status: ${history.position?.status}`);
  console.log(`- Initial: $${history.position?.initialValueUSD}`);
  console.log(`- Final: $${history.position?.finalValueUSD}`);
  console.log(`- Total PnL: $${history.position?.totalRealizedPnlUSD}`);
  console.log(`- Fees: $${history.position?.totalFeesClaimedUSD}`);
  console.log("\n");

  console.log("Segments:");
  history.segments.forEach((seg) => {
    console.log(`  Segment ${seg.segmentNumber}:`);
    console.log(
      `  - Duration: ${seg.startTimestamp} to ${seg.endTimestamp || "Active"}`
    );
    console.log(`  - Initial: $${seg.initialValueUSD}`);
    console.log(`  - Final: $${seg.finalValueUSD || "N/A"}`);
    console.log(
      `  - PnL: $${seg.realizedPnlUSD || "N/A"} (${seg.realizedPnlPercentage || "N/A"}%)`
    );
    console.log(`  - Fees claimed: $${seg.feesClaimedUSD}`);
    console.log(`  - Closure reason: ${seg.closureReason || "N/A"}`);
    console.log();
  });

  console.log("Fee Claims:");
  history.claims.forEach((claim, i) => {
    console.log(`  Claim ${i + 1}:`);
    console.log(`  - Type: ${claim.claimType}`);
    console.log(`  - Amount: $${claim.claimedUSDValue}`);
    console.log(`  - Timestamp: ${claim.timestamp}`);
    console.log();
  });

  console.log("Rebalance Events:");
  history.rebalances.forEach((rebal, i) => {
    console.log(`  Rebalance ${i + 1}:`);
    console.log(`  - Trigger: ${rebal.triggerReason}`);
    console.log(
      `  - Segment PnL: $${rebal.segmentPnlUSD} (${rebal.segmentPnlPercentage}%)`
    );
    console.log(`  - Fees collected: $${rebal.feesCollectedUSD}`);
    console.log(`  - Old position: ${rebal.oldPositionAddress}`);
    console.log(`  - New position: ${rebal.newPositionAddress}`);
    console.log();
  });
}

// ============================================================================
// RUN COMPLETE LIFECYCLE
// ============================================================================

async function runCompleteLifecycle() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║          COMPLETE POSITION LIFECYCLE EXAMPLE             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("\n");

  try {
    // Step 1: Create position
    const positionId = await step1_createPosition();

    // Step 2: First auto-rebalance
    await step2_firstRebalance(positionId);

    // Step 3: Manual fee claim
    await step3_manualClaimFees(positionId);

    // Step 4: Second auto-rebalance
    await step4_secondRebalance(positionId);

    // Step 5: Close position
    await step5_closePosition(positionId);

    // Step 6: View complete history
    await step6_viewHistory(positionId);

    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║                   LIFECYCLE COMPLETE                     ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log("\n");
  } catch (error) {
    console.error("Error during lifecycle:", error);
  }
}

// Export for use
export { runCompleteLifecycle };

/**
 * EXPECTED OUTPUT SUMMARY:
 *
 * Initial Investment: $1,000
 *
 * Segment 1: $1,000 → $1,200 (+$200 PnL + $50 fees)
 * Segment 2: $1,200 → $1,475 (+$275 PnL + $75 fees claimed + $25 fees)
 * Segment 3: $1,475 → $1,550 (+$75 PnL + $40 fees)
 *
 * Final Breakdown:
 * - Position value gain: $550 ($1,550 - $1,000)
 * - Total fees earned: $190 ($50 + $75 + $25 + $40)
 * - Total PnL: $740 (74%)
 *
 * The key insight: We track each segment's PnL separately, but show
 * the user ONE cumulative PnL number that accounts for:
 * 1. All position value changes across segments
 * 2. All fees claimed (whether manual or during rebalance)
 * 3. All realized gains from closed segments
 */
