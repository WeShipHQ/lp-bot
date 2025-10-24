import { db, positions, positionSegments, positionSnapshots } from "@/db";
import { PositionCreationContext } from "@/application/position/create-position.use-case";
import { logger } from "@/utils/logger";
import Decimal from "decimal.js";
import { eq } from "drizzle-orm";

interface CreatePositionInDbParams {
  signature: string;
  positionAddress: string;
  context: PositionCreationContext;
  onChainData?: {
    actualTokenAAmount: string;
    actualTokenBAmount: string;
    lowerBinId?: number;
    upperBinId?: number;
  };
  prices: {
    tokenAUsd: number;
    tokenBUsd: number;
    solUsd: number;
  };
}

/**
 * PositionPersistenceService
 *
 * Handles database persistence for positions after transaction confirmation.
 * Creates Position, PositionSegment, and PositionSnapshot records.
 */
export class PositionPersistenceService {
  /**
   * Create a new position record with initial segment and snapshot
   */
  async createPosition(params: CreatePositionInDbParams): Promise<string> {
    const { signature, positionAddress, context, onChainData, prices } = params;

    return await db.transaction(async (tx) => {
      const tokenAAmount =
        onChainData?.actualTokenAAmount ?? context.tokenAAmount;
      const tokenBAmount =
        onChainData?.actualTokenBAmount ?? context.tokenBAmount;

      const tokenAPriceUsd = prices.tokenAUsd;
      const tokenBPriceUsd = prices.tokenBUsd;
      const solPriceUsd = prices.solUsd;

      const initialValueUSD = new Decimal(tokenAAmount)
        .mul(tokenAPriceUsd)
        .add(new Decimal(tokenBAmount).mul(tokenBPriceUsd));

      const initialValueSOL = context.solAmount
        ? new Decimal(context.solAmount).toFixed(9)
        : new Decimal(initialValueUSD).div(solPriceUsd).toFixed(9);

      const [position] = await tx
        .insert(positions)
        .values({
          userId: context.userId,
          positionAddress,
          poolAddress: context.poolAddress,
          dex: context.dex,
          strategyType: "DLMM",
          tokenX: context.tokenA,
          tokenY: context.tokenB,
          status: "ACTIVE",
          initialValueUSD: initialValueUSD.toFixed(6),
          initialValueSOL: initialValueSOL,
          initialTokenXAmount: tokenAAmount,
          initialTokenYAmount: tokenBAmount,
          initialTokenXPriceUSD: tokenAPriceUsd.toString(),
          initialTokenYPriceUSD: tokenBPriceUsd.toString(),
          currentSegmentNumber: 1,
          currentSegmentInitialUSD: initialValueUSD.toFixed(6),
          currentSegmentStartAt: new Date(),
          totalRealizedPnlUSD: "0",
          totalFeesClaimedUSD: "0",
          isRebalancingEnabled: context.autoRebalance,
          rebalanceThreshold: context.rebalanceThreshold?.toString() ?? "20.0",
          slPercentage: context.slPercentage?.toString(),
          tpPercentage: context.tpPercentage?.toString(),
          creationSignature: signature,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      logger.info("Position created in DB", {
        positionId: position.id,
        positionAddress,
        signature,
        userId: context.userId,
      });

      const [segment] = await tx
        .insert(positionSegments)
        .values({
          positionId: position.id,
          segmentNumber: 1,
          startTimestamp: new Date(),
          initialValueUSD: initialValueUSD.toFixed(2),
          startPositionAddress: positionAddress,
          createdAt: new Date(),
        })
        .returning();

      logger.info("Position segment created", {
        segmentId: segment.id,
        positionId: position.id,
        segmentNumber: 1,
      });

      await tx.insert(positionSnapshots).values({
        positionId: position.id,
        segmentId: segment.id,
        snapshotType: "creation",
        snapshotTimestamp: new Date(),
        currentValueUSD: initialValueUSD.toFixed(6),
        tokenXAmount: tokenAAmount,
        tokenYAmount: tokenBAmount,
        unclaimedFeesX: "0",
        unclaimedFeesY: "0",
        unclaimedFeesUSD: "0",
        unrealizedPnlUSD: "0",
        unrealizedPnlPercentage: "0",
        totalPnlUSD: "0",
        totalPnlPercentage: "0",
        tokenXPriceUSD: tokenAPriceUsd.toString(),
        tokenYPriceUSD: tokenBPriceUsd.toString(),
        solPriceUSD: solPriceUsd.toString(),
        createdAt: new Date(),
      });

      logger.info("Position snapshot created", {
        positionId: position.id,
        segmentId: segment.id,
        snapshotType: "creation",
      });

      return position.id;
    });
  }

  /**
   * Update position with on-chain data after enrichment
   */
  async enrichPosition(positionId: string, enrichmentData: any): Promise<void> {
    await db
      .update(positions)
      .set({
        ...enrichmentData,
        updatedAt: new Date(),
      })
      .where(eq(positions.id, positionId));

    logger.info("Position enriched", { positionId, enrichmentData });
  }
}

export const positionPersistenceService = new PositionPersistenceService();
