import {
  db,
  positions,
  positionSegments,
  claimHistory,
  positionSnapshots,
} from "@/db";
import { logger } from "@/utils/logger";
import Decimal from "decimal.js";
import { desc, eq } from "drizzle-orm";

interface ClaimFeesContext {
  positionId: string;
  userId: string;
}

interface ClaimedAmounts {
  tokenXAmount: string;
  tokenYAmount: string;
  claimedUsdValue: string;
  tokenXPriceUsd: number;
  tokenYPriceUsd: number;
  solReceived?: string;
}

interface ClaimPrices {
  solUsd: number;
}

interface ClaimSnapshotData {
  tokenXAmount: string;
  tokenYAmount: string;
  currentValueUsd: string;
  unclaimedFeesX?: string;
  unclaimedFeesY?: string;
  unclaimedFeesUsd?: string;
}

interface RecordClaimParams {
  signature: string;
  context: ClaimFeesContext;
  claimed: ClaimedAmounts;
  prices: ClaimPrices;
  claimType?: "manual" | "rebalance" | "closure";
  snapshot?: ClaimSnapshotData;
}

export class ClaimFeesPersistenceService {
  async recordClaim(params: RecordClaimParams): Promise<void> {
    const { signature, context, claimed, prices, snapshot } = params;
    const claimType = params.claimType ?? "manual";

    await db.transaction(async (tx) => {
      const [position] = await tx
        .select()
        .from(positions)
        .where(eq(positions.id, context.positionId))
        .limit(1);

      if (!position) {
        throw new Error(`Position not found: ${context.positionId}`);
      }

      const [segment] = await tx
        .select()
        .from(positionSegments)
        .where(eq(positionSegments.positionId, context.positionId))
        .orderBy(desc(positionSegments.segmentNumber))
        .limit(1);

      const segmentId = segment?.id;

      const claimedUsdDecimal = new Decimal(claimed.claimedUsdValue ?? "0");

      await tx.insert(claimHistory).values({
        positionId: context.positionId,
        segmentId,
        timestamp: new Date(),
        claimType,
        claimedTokenXAmount: claimed.tokenXAmount,
        claimedTokenYAmount: claimed.tokenYAmount,
        claimedUSDValue: claimed.claimedUsdValue,
        tokenXPriceUSD: claimed.tokenXPriceUsd.toString(),
        tokenYPriceUSD: claimed.tokenYPriceUsd.toString(),
        solReceived: claimed.solReceived,
        solPriceUSD: prices.solUsd.toString(),
        transactionSignature: signature,
        isDuringRebalance: claimType === "rebalance",
        createdAt: new Date(),
      });

      const currentTotalFees = new Decimal(position.totalFeesClaimedUSD ?? "0");
      const newTotalFees = currentTotalFees.add(claimedUsdDecimal).toFixed(2);

      await tx
        .update(positions)
        .set({
          totalFeesClaimedUSD: newTotalFees,
          updatedAt: new Date(),
        })
        .where(eq(positions.id, context.positionId));

      if (segmentId) {
        const segmentFees = new Decimal(segment?.feesClaimedUSD ?? "0");
        const newSegmentFees = segmentFees.add(claimedUsdDecimal).toFixed(2);

        await tx
          .update(positionSegments)
          .set({ feesClaimedUSD: newSegmentFees })
          .where(eq(positionSegments.id, segmentId));
      }

      if (snapshot) {
        const currentValueDecimal = new Decimal(snapshot.currentValueUsd ?? "0");
        const segmentInitialDecimal = new Decimal(
          segment?.initialValueUSD ?? position.currentSegmentInitialUSD ?? "0"
        );

        const unrealizedPnlDecimal = currentValueDecimal.sub(segmentInitialDecimal);
        const unrealizedPnlUsd = unrealizedPnlDecimal.toFixed(2);
        const unrealizedPnlPercentage = segmentInitialDecimal.equals(0)
          ? "0"
          : unrealizedPnlDecimal
              .div(segmentInitialDecimal)
              .mul(100)
              .toFixed(4);

        const totalRealizedPnlDecimal = new Decimal(
          position.totalRealizedPnlUSD ?? "0"
        );
        const totalFeesDecimal = new Decimal(newTotalFees);
        const totalPnlDecimal = totalRealizedPnlDecimal
          .add(unrealizedPnlDecimal)
          .add(totalFeesDecimal);

        const totalPnlUsd = totalPnlDecimal.toFixed(2);
        const totalPnlPercentage = new Decimal(position.initialValueUSD ?? "0").equals(0)
          ? "0"
          : totalPnlDecimal
              .div(new Decimal(position.initialValueUSD))
              .mul(100)
              .toFixed(4);

        await tx.insert(positionSnapshots).values({
          positionId: context.positionId,
          segmentId,
          snapshotType: "claim",
          snapshotTimestamp: new Date(),
          currentValueUSD: currentValueDecimal.toFixed(2),
          tokenXAmount: snapshot.tokenXAmount,
          tokenYAmount: snapshot.tokenYAmount,
          unclaimedFeesX: snapshot.unclaimedFeesX ?? "0",
          unclaimedFeesY: snapshot.unclaimedFeesY ?? "0",
          unclaimedFeesUSD: snapshot.unclaimedFeesUsd ?? "0",
          unrealizedPnlUSD: unrealizedPnlUsd,
          unrealizedPnlPercentage,
          totalPnlUSD: totalPnlUsd,
          totalPnlPercentage,
          tokenXPriceUSD: claimed.tokenXPriceUsd.toString(),
          tokenYPriceUSD: claimed.tokenYPriceUsd.toString(),
          solPriceUSD: prices.solUsd.toString(),
          createdAt: new Date(),
        });
      }
    });

    logger.info("Claim recorded in database", {
      positionId: context.positionId,
      userId: context.userId,
      signature,
    });
  }
}

export const claimFeesPersistenceService = new ClaimFeesPersistenceService();
