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

export interface ClosePositionPersistenceSummary {
  positionId: string;
  positionAddress: string;
  finalValueUSD: string;
  finalValueSOL: string;
  totalPnlUSD: string;
  totalPnlPercentage: string;
  segmentPnlUSD: string;
  segmentPnlPercentage: string;
  feesClaimedUSD: string;
  claimedTokenXAmount: string;
  claimedTokenYAmount: string;
  finalTokenXAmount: string;
  finalTokenYAmount: string;
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
  async closePosition(
    params: ClosePositionInDbParams
  ): Promise<ClosePositionPersistenceSummary> {
    const { signature, context, onChainData, prices } = params;

    return await db.transaction(async (tx) => {
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

      const finalTokenAAmountDecimal = new Decimal(
        finalTokenAAmount.toString()
      );

      const finalTokenBAmountDecimal = new Decimal(
        finalTokenBAmount.toString()
      );

      const finalValueUSD = finalTokenAAmountDecimal
        .mul(prices.tokenAUsd)
        .add(finalTokenBAmountDecimal.mul(prices.tokenBUsd));

      // 3. Calculate and claim remaining fees
      const claimedFeesX = onChainData?.claimedFeesX ?? "0";
      const claimedFeesY = onChainData?.claimedFeesY ?? "0";

      const feesClaimedUSD = new Decimal(claimedFeesX)
        .mul(prices.tokenAUsd)
        .add(new Decimal(claimedFeesY).mul(prices.tokenBUsd));

      console.log("finalTokenAAmount", finalTokenAAmount);
      console.log("finalTokenBAmount", finalTokenBAmount);
      console.log("finalValueUSD", finalValueUSD);
      console.log("claimedFeesX", claimedFeesX);
      console.log("claimedFeesY", claimedFeesY);
      console.log("feesClaimedUSD", feesClaimedUSD);

      if (feesClaimedUSD.greaterThan(0)) {
        await tx.insert(claimHistory).values({
          positionId: context.positionId,
          segmentId: currentSegment.id,
          timestamp: new Date(),
          claimType: "closure",
          claimedTokenXAmount: claimedFeesX,
          claimedTokenYAmount: claimedFeesY,
          claimedUSDValue: feesClaimedUSD.toFixed(6),
          tokenXPriceUSD: prices.tokenAUsd.toString(),
          tokenYPriceUSD: prices.tokenBUsd.toString(),
          transactionSignature: signature,
          isDuringRebalance: false,
          createdAt: new Date(),
        });

        logger.info("Fees claimed during position closure", {
          positionId: context.positionId,
          feesClaimedUSD: feesClaimedUSD.toFixed(6),
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
          finalValueUSD: finalValueUSD.toFixed(6),
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
      const newTotalRealizedPnl = new Decimal(position.totalRealizedPnlUSD).add(
        segmentPnlUSD
      );
      const newTotalFeesClaimed = new Decimal(position.totalFeesClaimedUSD).add(
        feesClaimedUSD
      );
      // Total PnL = Position Value Gain + All Fees
      // Position Value Gain = (finalValueUSD - initialValueUSD)
      const positionValueGain = finalValueUSD.sub(position.initialValueUSD);
      const totalPnlUSD = positionValueGain.add(newTotalFeesClaimed);

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
          finalValueUSD: finalValueUSD.toFixed(6),
          finalValueSOL,
          finalTokenXAmount: finalTokenAAmount.toString(),
          finalTokenYAmount: finalTokenBAmount.toString(),
          finalTokenXPriceUSD: prices.tokenAUsd.toString(),
          finalTokenYPriceUSD: prices.tokenBUsd.toString(),
          totalRealizedPnlUSD: newTotalRealizedPnl.toFixed(6),
          totalFeesClaimedUSD: newTotalFeesClaimed.toFixed(6),
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
        currentValueUSD: finalValueUSD.toFixed(6),
        tokenXAmount: finalTokenAAmount.toString(),
        tokenYAmount: finalTokenBAmount.toString(),
        unclaimedFeesX: "0",
        unclaimedFeesY: "0",
        unclaimedFeesUSD: "0",
        unrealizedPnlUSD: "0",
        unrealizedPnlPercentage: "0",
        totalPnlUSD: totalPnlUSD.toFixed(6),
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

      return {
        positionId: context.positionId,
        positionAddress: context.positionAddress,
        finalValueUSD: finalValueUSD.toFixed(2),
        finalValueSOL,
        totalPnlUSD: totalPnlUSD.toFixed(6),
        totalPnlPercentage,
        segmentPnlUSD,
        segmentPnlPercentage,
        feesClaimedUSD: feesClaimedUSD.toFixed(6),
        claimedTokenXAmount: claimedFeesX,
        claimedTokenYAmount: claimedFeesY,
        finalTokenXAmount: finalTokenAAmount.toString(),
        finalTokenYAmount: finalTokenBAmount.toString(),
      };
    });
  }
}

export const closePositionPersistenceService =
  new ClosePositionPersistenceService();
