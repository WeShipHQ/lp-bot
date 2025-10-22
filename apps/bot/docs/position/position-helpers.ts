import { db } from "@/db";
import {
  positions,
  positionSegments,
  claimHistory,
  rebalanceEvents,
  positionSnapshots,
  NewPosition,
  NewPositionSegment,
  NewClaimHistory,
  NewRebalanceEvent,
  NewPositionSnapshot,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import Decimal from "decimal.js";

// ============================================================================
// POSITION CREATION
// ============================================================================

interface CreatePositionParams {
  userId: string;
  positionAddress: string;
  poolAddress: string;
  strategyType: "SPOT" | "CURVE" | "BID_ASK";
  tokenX: { symbol: string; mint: string; decimals: number; logoUri?: string };
  tokenY: { symbol: string; mint: string; decimals: number; logoUri?: string };
  initialValueUSD: string;
  initialValueSOL: string;
  initialTokenXAmount: string;
  initialTokenYAmount: string;
  initialTokenXPriceUSD: string;
  initialTokenYPriceUSD: string;
  isRebalancingEnabled: boolean;
  rebalanceThreshold?: string;
  slPercentage?: string;
  tpPercentage?: string;
  creationSignature: string;
}

export async function createPosition(params: CreatePositionParams) {
  return await db.transaction(async (tx) => {
    // 1. Create the position
    const [position] = await tx
      .insert(positions)
      .values({
        userId: params.userId,
        positionAddress: params.positionAddress,
        poolAddress: params.poolAddress,
        strategyType: params.strategyType,
        tokenX: params.tokenX,
        tokenY: params.tokenY,
        status: "ACTIVE",
        initialValueUSD: params.initialValueUSD,
        initialValueSOL: params.initialValueSOL,
        initialTokenXAmount: params.initialTokenXAmount,
        initialTokenYAmount: params.initialTokenYAmount,
        initialTokenXPriceUSD: params.initialTokenXPriceUSD,
        initialTokenYPriceUSD: params.initialTokenYPriceUSD,
        currentSegmentNumber: 1,
        currentSegmentInitialUSD: params.initialValueUSD,
        currentSegmentStartAt: new Date(),
        isRebalancingEnabled: params.isRebalancingEnabled,
        rebalanceThreshold: params.rebalanceThreshold,
        slPercentage: params.slPercentage,
        tpPercentage: params.tpPercentage,
        creationSignature: params.creationSignature,
      })
      .returning();

    // 2. Create the first segment
    const [segment] = await tx
      .insert(positionSegments)
      .values({
        positionId: position.id,
        segmentNumber: 1,
        startTimestamp: new Date(),
        initialValueUSD: params.initialValueUSD,
        startPositionAddress: params.positionAddress,
      })
      .returning();

    // 3. Create initial snapshot
    await tx.insert(positionSnapshots).values({
      positionId: position.id,
      segmentId: segment.id,
      snapshotType: "CREATION",
      currentValueUSD: params.initialValueUSD,
      tokenXAmount: params.initialTokenXAmount,
      tokenYAmount: params.initialTokenYAmount,
      unclaimedFeesX: "0",
      unclaimedFeesY: "0",
      unclaimedFeesUSD: "0",
      unrealizedPnlUSD: "0",
      unrealizedPnlPercentage: "0",
      totalPnlUSD: "0",
      totalPnlPercentage: "0",
      tokenXPriceUSD: params.initialTokenXPriceUSD,
      tokenYPriceUSD: params.initialTokenYPriceUSD,
      solPriceUSD: "100", // Get from price oracle
    });

    return { position, segment };
  });
}

// ============================================================================
// FEE CLAIMING
// ============================================================================

interface ClaimFeesParams {
  positionId: string;
  claimType: "MANUAL" | "REBALANCE" | "CLOSURE";
  claimedTokenXAmount: string;
  claimedTokenYAmount: string;
  tokenXPriceUSD: string;
  tokenYPriceUSD: string;
  transactionSignature: string;
  solReceived?: string; // If user chose to swap to SOL
  solPriceUSD?: string;
}

export async function claimFees(params: ClaimFeesParams) {
  return await db.transaction(async (tx) => {
    // 1. Get current position
    const [position] = await tx
      .select()
      .from(positions)
      .where(eq(positions.id, params.positionId))
      .limit(1);

    if (!position) throw new Error("Position not found");

    // 2. Calculate USD value of claimed fees
    const claimedUSDValue = new Decimal(params.claimedTokenXAmount)
      .mul(params.tokenXPriceUSD)
      .add(new Decimal(params.claimedTokenYAmount).mul(params.tokenYPriceUSD))
      .toFixed(2);

    // 3. Get current segment
    const [currentSegment] = await tx
      .select()
      .from(positionSegments)
      .where(
        and(
          eq(positionSegments.positionId, params.positionId),
          eq(positionSegments.segmentNumber, position.currentSegmentNumber)
        )
      )
      .limit(1);

    // 4. Record the claim
    const [claim] = await tx
      .insert(claimHistory)
      .values({
        positionId: params.positionId,
        segmentId: currentSegment?.id,
        claimType: params.claimType,
        claimedTokenXAmount: params.claimedTokenXAmount,
        claimedTokenYAmount: params.claimedTokenYAmount,
        claimedUSDValue,
        tokenXPriceUSD: params.tokenXPriceUSD,
        tokenYPriceUSD: params.tokenYPriceUSD,
        solReceived: params.solReceived,
        solPriceUSD: params.solPriceUSD,
        transactionSignature: params.transactionSignature,
        isDuringRebalance: params.claimType === "REBALANCE",
      })
      .returning();

    // 5. Update position's total claimed fees
    const newTotalClaimedUSD = new Decimal(position.totalFeesClaimedUSD)
      .add(claimedUSDValue)
      .toFixed(2);

    await tx
      .update(positions)
      .set({
        totalFeesClaimedUSD: newTotalClaimedUSD,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, params.positionId));

    // 6. Update current segment's claimed fees
    if (currentSegment) {
      const newSegmentFeesUSD = new Decimal(
        currentSegment.feesClaimedUSD || "0"
      )
        .add(claimedUSDValue)
        .toFixed(2);

      await tx
        .update(positionSegments)
        .set({ feesClaimedUSD: newSegmentFeesUSD })
        .where(eq(positionSegments.id, currentSegment.id));
    }

    return { claim, claimedUSDValue };
  });
}

// ============================================================================
// POSITION REBALANCING
// ============================================================================

interface RebalancePositionParams {
  positionId: string;
  triggerReason: string; // "out_of_range", "stop_loss", "take_profit"
  oldPositionAddress: string;
  newPositionAddress: string;

  // Old segment closure data
  segmentFinalValueUSD: string;

  // Fees collected during rebalance
  feesCollectedUSD: string;
  claimedTokenXAmount: string;
  claimedTokenYAmount: string;
  tokenXPriceUSD: string;
  tokenYPriceUSD: string;

  // New segment data
  newSegmentInitialUSD: string;

  // Transaction signatures
  closeTransactionSignature: string;
  createTransactionSignature: string;

  // Costs
  totalGasCostSOL?: string;
  slippageCostUSD?: string;
}

export async function rebalancePosition(params: RebalancePositionParams) {
  return await db.transaction(async (tx) => {
    // 1. Get current position and segment
    const [position] = await tx
      .select()
      .from(positions)
      .where(eq(positions.id, params.positionId))
      .limit(1);

    if (!position) throw new Error("Position not found");

    const [currentSegment] = await tx
      .select()
      .from(positionSegments)
      .where(
        and(
          eq(positionSegments.positionId, params.positionId),
          eq(positionSegments.segmentNumber, position.currentSegmentNumber)
        )
      )
      .limit(1);

    if (!currentSegment) throw new Error("Current segment not found");

    // 2. Calculate segment PnL
    const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);
    const segmentFinalUSD = new Decimal(params.segmentFinalValueUSD);
    const segmentPnlUSD = segmentFinalUSD.sub(segmentInitialUSD).toFixed(2);
    const segmentPnlPercentage = segmentFinalUSD
      .sub(segmentInitialUSD)
      .div(segmentInitialUSD)
      .mul(100)
      .toFixed(4);

    // 3. Close the current segment
    await tx
      .update(positionSegments)
      .set({
        endTimestamp: new Date(),
        finalValueUSD: params.segmentFinalValueUSD,
        realizedPnlUSD: segmentPnlUSD,
        realizedPnlPercentage: segmentPnlPercentage,
        closureReason: params.triggerReason,
        closureSignature: params.closeTransactionSignature,
        endPositionAddress: params.newPositionAddress,
      })
      .where(eq(positionSegments.id, currentSegment.id));

    // 4. Claim fees (if any were collected during rebalance)
    if (new Decimal(params.feesCollectedUSD).greaterThan(0)) {
      await claimFees({
        positionId: params.positionId,
        claimType: "REBALANCE",
        claimedTokenXAmount: params.claimedTokenXAmount,
        claimedTokenYAmount: params.claimedTokenYAmount,
        tokenXPriceUSD: params.tokenXPriceUSD,
        tokenYPriceUSD: params.tokenYPriceUSD,
        transactionSignature: params.closeTransactionSignature,
      });
    }

    // 5. Create new segment
    const newSegmentNumber = position.currentSegmentNumber + 1;
    const [newSegment] = await tx
      .insert(positionSegments)
      .values({
        positionId: params.positionId,
        segmentNumber: newSegmentNumber,
        startTimestamp: new Date(),
        initialValueUSD: params.newSegmentInitialUSD,
        startPositionAddress: params.newPositionAddress,
      })
      .returning();

    // 6. Record rebalance event
    const [rebalanceEvent] = await tx
      .insert(rebalanceEvents)
      .values({
        positionId: params.positionId,
        triggerReason: params.triggerReason,
        oldPositionAddress: params.oldPositionAddress,
        newPositionAddress: params.newPositionAddress,
        closedSegmentId: currentSegment.id,
        segmentInitialUSD: currentSegment.initialValueUSD,
        segmentFinalUSD: params.segmentFinalValueUSD,
        segmentPnlUSD,
        segmentPnlPercentage,
        feesCollectedUSD: params.feesCollectedUSD,
        newSegmentId: newSegment.id,
        newSegmentInitialUSD: params.newSegmentInitialUSD,
        closeTransactionSignature: params.closeTransactionSignature,
        createTransactionSignature: params.createTransactionSignature,
        totalGasCostSOL: params.totalGasCostSOL,
        slippageCostUSD: params.slippageCostUSD,
      })
      .returning();

    // 7. Update position
    const newTotalRealizedPnl = new Decimal(position.totalRealizedPnlUSD)
      .add(segmentPnlUSD)
      .toFixed(2);

    await tx
      .update(positions)
      .set({
        positionAddress: params.newPositionAddress,
        currentSegmentNumber: newSegmentNumber,
        currentSegmentInitialUSD: params.newSegmentInitialUSD,
        currentSegmentStartAt: new Date(),
        totalRealizedPnlUSD: newTotalRealizedPnl,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, params.positionId));

    return {
      rebalanceEvent,
      newSegment,
      segmentPnlUSD,
      segmentPnlPercentage,
    };
  });
}

// ============================================================================
// POSITION CLOSURE
// ============================================================================

interface ClosePositionParams {
  positionId: string;
  finalValueUSD: string;
  finalValueSOL: string;
  finalTokenXAmount: string;
  finalTokenYAmount: string;
  finalTokenXPriceUSD: string;
  finalTokenYPriceUSD: string;
  closureSignature: string;

  // Fees claimed on closure
  claimedTokenXAmount?: string;
  claimedTokenYAmount?: string;

  // Closure reason
  closureReason: "user_close" | "stop_loss" | "take_profit";
}

export async function closePosition(params: ClosePositionParams) {
  return await db.transaction(async (tx) => {
    // 1. Get position and current segment
    const [position] = await tx
      .select()
      .from(positions)
      .where(eq(positions.id, params.positionId))
      .limit(1);

    if (!position) throw new Error("Position not found");

    const [currentSegment] = await tx
      .select()
      .from(positionSegments)
      .where(
        and(
          eq(positionSegments.positionId, params.positionId),
          eq(positionSegments.segmentNumber, position.currentSegmentNumber)
        )
      )
      .limit(1);

    if (!currentSegment) throw new Error("Current segment not found");

    // 2. Claim any remaining fees
    if (params.claimedTokenXAmount && params.claimedTokenYAmount) {
      await claimFees({
        positionId: params.positionId,
        claimType: "CLOSURE",
        claimedTokenXAmount: params.claimedTokenXAmount,
        claimedTokenYAmount: params.claimedTokenYAmount,
        tokenXPriceUSD: params.finalTokenXPriceUSD,
        tokenYPriceUSD: params.finalTokenYPriceUSD,
        transactionSignature: params.closureSignature,
      });
    }

    // 3. Calculate final segment PnL
    const segmentFinalUSD = new Decimal(params.finalValueUSD);
    const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);
    const segmentPnlUSD = segmentFinalUSD.sub(segmentInitialUSD).toFixed(2);
    const segmentPnlPercentage = segmentFinalUSD
      .sub(segmentInitialUSD)
      .div(segmentInitialUSD)
      .mul(100)
      .toFixed(4);

    // 4. Close current segment
    await tx
      .update(positionSegments)
      .set({
        endTimestamp: new Date(),
        finalValueUSD: params.finalValueUSD,
        realizedPnlUSD: segmentPnlUSD,
        realizedPnlPercentage: segmentPnlPercentage,
        closureReason: params.closureReason,
        closureSignature: params.closureSignature,
      })
      .where(eq(positionSegments.id, currentSegment.id));

    // 5. Update position's total realized PnL
    const newTotalRealizedPnl = new Decimal(position.totalRealizedPnlUSD)
      .add(segmentPnlUSD)
      .toFixed(2);

    // 6. Calculate final total PnL
    // Total PnL = (Final Value - Initial Investment) + Total Fees Claimed
    const totalPnlUSD = new Decimal(params.finalValueUSD)
      .sub(position.initialValueUSD)
      .add(position.totalFeesClaimedUSD)
      .toFixed(2);

    const totalPnlPercentage = new Decimal(totalPnlUSD)
      .div(position.initialValueUSD)
      .mul(100)
      .toFixed(4);

    // 7. Close the position
    await tx
      .update(positions)
      .set({
        status: "CLOSED",
        closedAt: new Date(),
        finalValueUSD: params.finalValueUSD,
        finalValueSOL: params.finalValueSOL,
        finalTokenXAmount: params.finalTokenXAmount,
        finalTokenYAmount: params.finalTokenYAmount,
        finalTokenXPriceUSD: params.finalTokenXPriceUSD,
        finalTokenYPriceUSD: params.finalTokenYPriceUSD,
        totalRealizedPnlUSD: newTotalRealizedPnl,
        closureSignature: params.closureSignature,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, params.positionId));

    // 8. Create final snapshot
    await tx.insert(positionSnapshots).values({
      positionId: params.positionId,
      segmentId: currentSegment.id,
      snapshotType: "CLOSURE",
      currentValueUSD: params.finalValueUSD,
      tokenXAmount: params.finalTokenXAmount,
      tokenYAmount: params.finalTokenYAmount,
      unclaimedFeesX: "0",
      unclaimedFeesY: "0",
      unclaimedFeesUSD: "0",
      unrealizedPnlUSD: "0",
      unrealizedPnlPercentage: "0",
      totalPnlUSD,
      totalPnlPercentage,
      tokenXPriceUSD: params.finalTokenXPriceUSD,
      tokenYPriceUSD: params.finalTokenYPriceUSD,
      solPriceUSD: "100", // Get from price oracle
    });

    return {
      totalPnlUSD,
      totalPnlPercentage,
      finalValueUSD: params.finalValueUSD,
      totalFeesClaimedUSD: position.totalFeesClaimedUSD,
    };
  });
}

// ============================================================================
// PNL CALCULATION
// ============================================================================

/**
 * Calculate current PnL for an ACTIVE position
 * This includes:
 * - Unrealized PnL from current segment
 * - Realized PnL from closed segments
 * - All claimed fees
 */
export async function calculateCurrentPnL(
  positionId: string,
  currentValueUSD: string,
  unclaimedFeesUSD: string
) {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  if (!position) throw new Error("Position not found");

  // Unrealized PnL = (Current Value + Unclaimed Fees) - Current Segment Initial Value
  const [currentSegment] = await db
    .select()
    .from(positionSegments)
    .where(
      and(
        eq(positionSegments.positionId, positionId),
        eq(positionSegments.segmentNumber, position.currentSegmentNumber)
      )
    )
    .limit(1);

  const currentWithFees = new Decimal(currentValueUSD).add(unclaimedFeesUSD);
  const unrealizedPnlUSD = currentWithFees
    .sub(currentSegment?.initialValueUSD || "0")
    .toFixed(2);

  // Total PnL = Unrealized PnL + Total Realized PnL + Total Fees Claimed
  const totalPnlUSD = new Decimal(unrealizedPnlUSD)
    .add(position.totalRealizedPnlUSD)
    .add(position.totalFeesClaimedUSD)
    .toFixed(2);

  const totalPnlPercentage = new Decimal(totalPnlUSD)
    .div(position.initialValueUSD)
    .mul(100)
    .toFixed(4);

  return {
    unrealizedPnlUSD,
    realizedPnlUSD: position.totalRealizedPnlUSD,
    feesClaimedUSD: position.totalFeesClaimedUSD,
    totalPnlUSD,
    totalPnlPercentage,
    currentValueUSD,
    initialValueUSD: position.initialValueUSD,
  };
}

/**
 * Get position history including all segments and events
 */
export async function getPositionHistory(positionId: string) {
  const [position] = await db
    .select()
    .from(positions)
    .where(eq(positions.id, positionId))
    .limit(1);

  const segments = await db
    .select()
    .from(positionSegments)
    .where(eq(positionSegments.positionId, positionId))
    .orderBy(positionSegments.segmentNumber);

  const claims = await db
    .select()
    .from(claimHistory)
    .where(eq(claimHistory.positionId, positionId))
    .orderBy(desc(claimHistory.timestamp));

  const rebalances = await db
    .select()
    .from(rebalanceEvents)
    .where(eq(rebalanceEvents.positionId, positionId))
    .orderBy(desc(rebalanceEvents.timestamp));

  const snapshots = await db
    .select()
    .from(positionSnapshots)
    .where(eq(positionSnapshots.positionId, positionId))
    .orderBy(desc(positionSnapshots.snapshotTimestamp));

  return {
    position,
    segments,
    claims,
    rebalances,
    snapshots,
  };
}
