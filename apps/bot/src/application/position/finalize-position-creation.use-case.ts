/**
 * Finalize Position Creation Use Case
 * 
 * Handles database persistence after position creation transaction confirmation.
 * Creates Position, PositionSegment, and PositionSnapshot records atomically.
 */

import { db, positions, positionSegments, positionSnapshots } from "@/db";
import { logger } from "@/utils/logger";
import { Token } from "@/types/core.types";
import { PositionPersistenceError } from "@/domain/position";
import { v4 as uuidv4 } from "uuid";

export interface FinalizePositionCreationParams {
  // User context
  userId: string;
  
  // Position identification
  positionAddress: string;
  poolAddress: string;
  dex: string;
  
  // Tokens
  tokenX: Token;
  tokenY: Token;
  
  // Initial amounts (UI amounts as strings)
  initialTokenXAmount: string;
  initialTokenYAmount: string;
  
  // Prices at creation
  tokenXPriceUSD: string;
  tokenYPriceUSD: string;
  solPriceUSD: string;
  
  // Initial values
  initialValueUSD: string;
  initialValueSOL: string;
  
  // Strategy and configuration
  strategyType: "DLMM" | "DAMM" | "CONCENTRATED";
  isRebalancingEnabled: boolean;
  rebalanceThreshold?: string;
  
  // Transaction reference
  creationSignature: string;
  
  // Risk management (optional)
  slPercentage?: string;
  tpPercentage?: string;
}

export interface FinalizePositionCreationResult {
  success: boolean;
  positionId?: string;
  error?: string;
}

export class FinalizePositionCreationUseCase {
  /**
   * Execute finalization in a database transaction
   */
  async execute(
    params: FinalizePositionCreationParams
  ): Promise<FinalizePositionCreationResult> {
    try {
      logger.info(
        {
          userId: params.userId,
          positionAddress: params.positionAddress,
          poolAddress: params.poolAddress,
        },
        "[FinalizePositionCreation] Starting position finalization"
      );

      // Execute all database operations in a transaction
      const result = await db.transaction(async (tx) => {
        // 1. Insert Position record
        const positionId = uuidv4();
        const now = new Date().toISOString();

        await tx.insert(positions).values({
          id: positionId,
          userId: params.userId,
          
          // Position identification
          positionAddress: params.positionAddress,
          poolAddress: params.poolAddress,
          dex: params.dex,
          strategyType: params.strategyType,
          
          // Token information
          tokenX: params.tokenX,
          tokenY: params.tokenY,
          
          // Position lifecycle
          status: "ACTIVE",
          
          // Initial investment tracking
          initialValueUSD: params.initialValueUSD,
          initialValueSOL: params.initialValueSOL,
          initialTokenXAmount: params.initialTokenXAmount,
          initialTokenYAmount: params.initialTokenYAmount,
          initialTokenXPriceUSD: params.tokenXPriceUSD,
          initialTokenYPriceUSD: params.tokenYPriceUSD,
          
          // Current segment tracking (first segment)
          currentSegmentNumber: 1,
          currentSegmentInitialUSD: params.initialValueUSD,
          currentSegmentStartAt: now,
          
          // Cumulative PnL tracking (starts at zero)
          totalRealizedPnlUSD: "0",
          totalFeesClaimedUSD: "0",
          
          // Risk management
          isRebalancingEnabled: params.isRebalancingEnabled,
          rebalanceThreshold: params.rebalanceThreshold || "20.0",
          slPercentage: params.slPercentage,
          tpPercentage: params.tpPercentage,
          
          // Transaction references
          creationSignature: params.creationSignature,
          
          // Timestamps
          createdAt: now,
          updatedAt: now,
        });

        // 2. Insert first PositionSegment
        const segmentId = uuidv4();
        await tx.insert(positionSegments).values({
          id: segmentId,
          positionId,
          
          // Segment identification
          segmentNumber: 1,
          startTimestamp: now,
          
          // Segment values
          initialValueUSD: params.initialValueUSD,
          
          // Position state at segment start
          startPositionAddress: params.positionAddress,
          
          // Timestamps
          createdAt: now,
          updatedAt: now,
        });

        // 3. Insert creation snapshot
        await tx.insert(positionSnapshots).values({
          id: uuidv4(),
          positionId,
          segmentId,
          
          // Snapshot timing
          snapshotType: "creation",
          
          // Current position value (same as initial)
          currentValueUSD: params.initialValueUSD,
          tokenXAmount: params.initialTokenXAmount,
          tokenYAmount: params.initialTokenYAmount,
          
          // Unclaimed fees (zero at creation)
          unclaimedFeesX: "0",
          unclaimedFeesY: "0",
          unclaimedFeesUSD: "0",
          
          // PnL (zero at creation)
          unrealizedPnlUSD: "0",
          unrealizedPnlPercentage: "0",
          totalPnlUSD: "0",
          totalPnlPercentage: "0",
          
          // Token prices at snapshot
          tokenXPriceUSD: params.tokenXPriceUSD,
          tokenYPriceUSD: params.tokenYPriceUSD,
          solPriceUSD: params.solPriceUSD,
          
          // Timestamps
          createdAt: now,
          updatedAt: now,
        });

        logger.info(
          {
            positionId,
            segmentId,
            positionAddress: params.positionAddress,
          },
          "[FinalizePositionCreation] Database records created successfully"
        );

        return { positionId, segmentId };
      });

      return {
        success: true,
        positionId: result.positionId,
      };
    } catch (error) {
      logger.error(
        {
          error,
          params,
        },
        "[FinalizePositionCreation] Failed to finalize position"
      );

      // Wrap in domain error
      throw new PositionPersistenceError(
        "finalize_position_creation",
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
