import {
  db,
  positions,
  positionSegments,
  positionSnapshots,
  rebalanceEvents,
  claimHistory,
} from "@/db";
import { logger } from "@/utils/logger";
import Decimal from "decimal.js";
import { eq, desc } from "drizzle-orm";

interface RebalanceContext {
  userId: string;
  positionId: string;
  oldPositionAddress: string;
  newPositionAddress: string;
  triggerReason: string;
  tokenAAmount: string;
  tokenBAmount: string;
  tokenAMint: string;
  tokenBMint: string;
  poolAddress: string;
}

interface RebalancePositionInDbParams {
  signature: string;
  context: RebalanceContext;
  onChainData?: {
    actualTokenAAmount?: string;
    actualTokenBAmount?: string;
    claimedFeesX?: string;
    claimedFeesY?: string;
  };
  prices: {
    tokenAUsd: number;
    tokenBUsd: number;
    solUsd: number;
  };
}

/**
 * RebalancePersistenceService
 *
 * Handles database persistence for position rebalancing after transaction confirmation.
 * This involves:
 * 1. Closing the current segment
 * 2. Recording claimed fees (if any)
 * 3. Creating a new segment
 * 4. Recording the rebalance event
 * 5. Updating cumulative PnL
 */
export class RebalancePersistenceService {
  /**
   * Persist rebalance to database
   */
  async rebalancePosition(params: RebalancePositionInDbParams): Promise<void> {
    const { signature, context, onChainData, prices } = params;

    await db.transaction(async (tx) => {
      // 1. Fetch current position and segment
      const [position] = await tx
        .select()
        .from(positions)
        .where(eq(positions.id, context.positionId))
        .limit(1);

      if (!position) {
        throw new Error(`Position not found: ${context.positionId}`);
      }

      const [currentSegment] = await tx
        .select()
        .from(positionSegments)
        .where(eq(positionSegments.positionId, context.positionId))
        .orderBy(desc(positionSegments.segmentNumber))
        .limit(1);

      if (!currentSegment) {
        throw new Error(
          `Current segment not found for position: ${context.positionId}`
        );
      }

      // 2. Calculate segment final value (includes position value + fees)
      const tokenAAmount =
        onChainData?.actualTokenAAmount ?? context.tokenAAmount;
      const tokenBAmount =
        onChainData?.actualTokenBAmount ?? context.tokenBAmount;

      const tokenAAmountNum = parseFloat(tokenAAmount);
      const tokenBAmountNum = parseFloat(tokenBAmount);

      const segmentFinalUSD = new Decimal(tokenAAmountNum)
        .mul(prices.tokenAUsd)
        .add(new Decimal(tokenBAmountNum).mul(prices.tokenBUsd));

      // 3. Calculate fees collected during rebalance
      const claimedFeesX = onChainData?.claimedFeesX ?? "0";
      const claimedFeesY = onChainData?.claimedFeesY ?? "0";

      const feesCollectedUSD = new Decimal(parseFloat(claimedFeesX))
        .mul(prices.tokenAUsd)
        .add(new Decimal(parseFloat(claimedFeesY)).mul(prices.tokenBUsd));

      // The new segment initial value is segmentFinalUSD (includes fees that were claimed)
      const newSegmentInitialUSD = segmentFinalUSD.toString();

      // 4. Calculate segment PnL
      const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);
      const segmentPnlUSD = segmentFinalUSD.sub(segmentInitialUSD).toFixed(2);
      const segmentPnlPercentage = segmentFinalUSD
        .sub(segmentInitialUSD)
        .div(segmentInitialUSD)
        .mul(100)
        .toFixed(4);

      // 5. Close current segment
      await tx
        .update(positionSegments)
        .set({
          endTimestamp: new Date(),
          finalValueUSD: segmentFinalUSD.toFixed(2),
          realizedPnlUSD: segmentPnlUSD,
          realizedPnlPercentage: segmentPnlPercentage,
          closureReason: context.triggerReason,
          closureSignature: signature,
          endPositionAddress: context.newPositionAddress,
        })
        .where(eq(positionSegments.id, currentSegment.id));

      logger.info("Position segment closed for rebalance", {
        segmentId: currentSegment.id,
        segmentPnlUSD,
        segmentPnlPercentage,
      });

      // 6. Record fee claim if fees were collected
      if (feesCollectedUSD.greaterThan(0)) {
        await tx.insert(claimHistory).values({
          positionId: context.positionId,
          segmentId: currentSegment.id,
          claimType: "rebalance",
          claimedTokenXAmount: claimedFeesX,
          claimedTokenYAmount: claimedFeesY,
          claimedUSDValue: feesCollectedUSD.toFixed(2),
          tokenXPriceUSD: prices.tokenAUsd.toString(),
          tokenYPriceUSD: prices.tokenBUsd.toString(),
          transactionSignature: signature,
          isDuringRebalance: true,
        });

        logger.info("Fees claimed during rebalance", {
          positionId: context.positionId,
          feesCollectedUSD: feesCollectedUSD.toFixed(2),
        });
      }

      // 7. Create new segment
      const newSegmentNumber = position.currentSegmentNumber + 1;
      const [newSegment] = await tx
        .insert(positionSegments)
        .values({
          positionId: context.positionId,
          segmentNumber: newSegmentNumber,
          initialValueUSD: newSegmentInitialUSD,
          startPositionAddress: context.newPositionAddress,
          startTimestamp: new Date(),
        })
        .returning();

      logger.info("New position segment created for rebalance", {
        segmentId: newSegment.id,
        segmentNumber: newSegmentNumber,
        initialValueUSD: newSegmentInitialUSD,
      });

      // 8. Record rebalance event
      await tx.insert(rebalanceEvents).values({
        positionId: context.positionId,
        triggerReason: context.triggerReason,
        oldPositionAddress: context.oldPositionAddress,
        newPositionAddress: context.newPositionAddress,
        closedSegmentId: currentSegment.id,
        segmentInitialUSD: currentSegment.initialValueUSD,
        segmentFinalUSD: segmentFinalUSD.toFixed(2),
        segmentPnlUSD,
        segmentPnlPercentage,
        feesCollectedUSD: feesCollectedUSD.toFixed(2),
        newSegmentId: newSegment.id,
        newSegmentInitialUSD,
        closeTransactionSignature: signature,
        createTransactionSignature: signature,
      });

      logger.info("Rebalance event recorded", {
        positionId: context.positionId,
        triggerReason: context.triggerReason,
      });

      // 9. Update position with new segment info and cumulative PnL
      const newTotalRealizedPnl = new Decimal(position.totalRealizedPnlUSD)
        .add(segmentPnlUSD)
        .toFixed(2);

      const newTotalFeesClaimed = new Decimal(position.totalFeesClaimedUSD)
        .add(feesCollectedUSD)
        .toFixed(2);

      await tx
        .update(positions)
        .set({
          positionAddress: context.newPositionAddress,
          currentSegmentNumber: newSegmentNumber,
          currentSegmentInitialUSD: newSegmentInitialUSD,
          currentSegmentStartAt: new Date(),
          totalRealizedPnlUSD: newTotalRealizedPnl,
          totalFeesClaimedUSD: newTotalFeesClaimed,
          status: "ACTIVE",
        })
        .where(eq(positions.id, context.positionId));

      logger.info("Position updated after rebalance", {
        positionId: context.positionId,
        newPositionAddress: context.newPositionAddress,
        newSegmentNumber,
        totalRealizedPnlUSD: newTotalRealizedPnl,
      });

      // 10. Create snapshot for the rebalance
      await tx.insert(positionSnapshots).values({
        positionId: context.positionId,
        segmentId: newSegment.id,
        snapshotType: "rebalance",
        currentValueUSD: newSegmentInitialUSD,
        tokenXAmount: tokenAAmount,
        tokenYAmount: tokenBAmount,
        unclaimedFeesX: "0",
        unclaimedFeesY: "0",
        unclaimedFeesUSD: "0",
        unrealizedPnlUSD: "0",
        unrealizedPnlPercentage: "0",
        totalPnlUSD: newTotalRealizedPnl,
        totalPnlPercentage: new Decimal(newTotalRealizedPnl)
          .div(position.initialValueUSD)
          .mul(100)
          .toFixed(4),
        tokenXPriceUSD: prices.tokenAUsd.toString(),
        tokenYPriceUSD: prices.tokenBUsd.toString(),
        solPriceUSD: prices.solUsd.toString(),
      });

      logger.info("Position snapshot created for rebalance", {
        positionId: context.positionId,
        segmentId: newSegment.id,
      });
    });
  }
}

export const rebalancePersistenceService = new RebalancePersistenceService();
