import {
  db,
  positions,
  positionSegments,
  positionSnapshots,
  claimHistory,
} from "@/db";
import { logger } from "@/utils/logger";
import Decimal from "decimal.js";
import { eq, desc } from "drizzle-orm";

interface ClosePositionContext {
  userId: string;
  positionId: string;
  positionAddress: string;
  closureReason: "user_close" | "stop_loss" | "take_profit";
  poolAddress: string;
  tokenAMint: string;
  tokenBMint: string;
}

interface ClosePositionInDbParams {
  signature: string;
  context: ClosePositionContext;
  onChainData?: {
    finalTokenAAmount?: string;
    finalTokenBAmount?: string;
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
 * ClosePositionPersistenceService
 *
 * Handles database persistence for position closure after transaction confirmation.
 * This involves:
 * 1. Closing the current segment
 * 2. Recording claimed fees (all remaining fees)
 * 3. Updating position status to CLOSED
 * 4. Calculating final PnL
 * 5. Creating final snapshot
 */
export class ClosePositionPersistenceService {
  /**
   * Close position and persist to database
   */
  async closePosition(params: ClosePositionInDbParams): Promise<void> {
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

      // 2. Calculate final position value
      const finalTokenAAmount =
        onChainData?.finalTokenAAmount ?? position.initialTokenXAmount;
      const finalTokenBAmount =
        onChainData?.finalTokenBAmount ?? position.initialTokenYAmount;

      const finalTokenAAmountNum = parseFloat(finalTokenAAmount.toString());
      const finalTokenBAmountNum = parseFloat(finalTokenBAmount.toString());

      const finalValueUSD = new Decimal(finalTokenAAmountNum)
        .mul(prices.tokenAUsd)
        .add(new Decimal(finalTokenBAmountNum).mul(prices.tokenBUsd));

      // 3. Calculate and claim remaining fees
      const claimedFeesX = onChainData?.claimedFeesX ?? "0";
      const claimedFeesY = onChainData?.claimedFeesY ?? "0";

      const feesClaimedUSD = new Decimal(parseFloat(claimedFeesX))
        .mul(prices.tokenAUsd)
        .add(new Decimal(parseFloat(claimedFeesY)).mul(prices.tokenBUsd));

      if (feesClaimedUSD.greaterThan(0)) {
        await tx.insert(claimHistory).values({
          positionId: context.positionId,
          segmentId: currentSegment.id,
          timestamp: new Date(),
          claimType: "closure",
          claimedTokenXAmount: claimedFeesX,
          claimedTokenYAmount: claimedFeesY,
          claimedUSDValue: feesClaimedUSD.toFixed(2),
          tokenXPriceUSD: prices.tokenAUsd.toString(),
          tokenYPriceUSD: prices.tokenBUsd.toString(),
          transactionSignature: signature,
          isDuringRebalance: false,
          createdAt: new Date(),
        });

        logger.info("Fees claimed during position closure", {
          positionId: context.positionId,
          feesClaimedUSD: feesClaimedUSD.toFixed(2),
        });
      }

      // 4. Calculate segment PnL
      const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);
      const segmentFinalUSD = finalValueUSD.add(feesClaimedUSD);
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
          finalValueUSD: finalValueUSD.toFixed(2),
          realizedPnlUSD: segmentPnlUSD,
          realizedPnlPercentage: segmentPnlPercentage,
          closureReason: context.closureReason,
          closureSignature: signature,
        })
        .where(eq(positionSegments.id, currentSegment.id));

      logger.info("Position segment closed", {
        segmentId: currentSegment.id,
        segmentPnlUSD,
        segmentPnlPercentage,
      });

      // 6. Calculate total position PnL
      const newTotalRealizedPnl = new Decimal(position.totalRealizedPnlUSD)
        .add(segmentPnlUSD)
        .toFixed(2);

      const newTotalFeesClaimed = new Decimal(position.totalFeesClaimedUSD)
        .add(feesClaimedUSD)
        .toFixed(2);

      // Total PnL = Position Value Gain + All Fees
      // Position Value Gain = (finalValueUSD - initialValueUSD)
      const positionValueGain = finalValueUSD.sub(position.initialValueUSD);
      const totalPnlUSD = positionValueGain.add(newTotalFeesClaimed).toFixed(2);

      const totalPnlPercentage = new Decimal(totalPnlUSD)
        .div(position.initialValueUSD)
        .mul(100)
        .toFixed(4);

      const finalValueSOL = finalValueUSD.div(prices.solUsd).toFixed(9);

      // 7. Update position to CLOSED status
      await tx
        .update(positions)
        .set({
          status: "CLOSED",
          closedAt: new Date(),
          finalValueUSD: finalValueUSD.toFixed(2),
          finalValueSOL,
          finalTokenXAmount: finalTokenAAmount.toString(),
          finalTokenYAmount: finalTokenBAmount.toString(),
          finalTokenXPriceUSD: prices.tokenAUsd.toString(),
          finalTokenYPriceUSD: prices.tokenBUsd.toString(),
          totalRealizedPnlUSD: newTotalRealizedPnl,
          totalFeesClaimedUSD: newTotalFeesClaimed,
          closureSignature: signature,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, context.positionId));

      logger.info("Position closed in database", {
        positionId: context.positionId,
        positionAddress: context.positionAddress,
        closureReason: context.closureReason,
        finalValueUSD: finalValueUSD.toFixed(2),
        totalPnlUSD,
        totalPnlPercentage,
      });

      // 8. Create final snapshot
      await tx.insert(positionSnapshots).values({
        positionId: context.positionId,
        segmentId: currentSegment.id,
        snapshotType: "closure",
        snapshotTimestamp: new Date(),
        currentValueUSD: finalValueUSD.toFixed(2),
        tokenXAmount: finalTokenAAmount.toString(),
        tokenYAmount: finalTokenBAmount.toString(),
        unclaimedFeesX: "0",
        unclaimedFeesY: "0",
        unclaimedFeesUSD: "0",
        unrealizedPnlUSD: "0",
        unrealizedPnlPercentage: "0",
        totalPnlUSD,
        totalPnlPercentage,
        tokenXPriceUSD: prices.tokenAUsd.toString(),
        tokenYPriceUSD: prices.tokenBUsd.toString(),
        solPriceUSD: prices.solUsd.toString(),
        createdAt: new Date(),
      });

      logger.info("Position snapshot created for closure", {
        positionId: context.positionId,
        segmentId: currentSegment.id,
        closureReason: context.closureReason,
      });
    });
  }
}

export const closePositionPersistenceService =
  new ClosePositionPersistenceService();
