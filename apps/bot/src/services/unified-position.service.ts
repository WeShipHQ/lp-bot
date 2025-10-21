import { dexRegistry } from "./dex-registry.service";
import {
  DexType,
  UnifiedPosition,
  UnifiedPortfolio,
  TransactionResult,
  CreatePositionParams,
  RebalanceParams,
  DexAdapterError,
} from "../types/core.types";
import type { PositionContext } from "@/types/dex-adapter.interface";

export class UnifiedPositionService {
  async getUserPositions(
    userAddress: string,
    dexType: DexType
  ): Promise<UnifiedPosition[]> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.getUserPositions(userAddress);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to get positions for ${userAddress} from ${dexType}`,
        dexType,
        "POSITIONS_FETCH_ERROR",
        error as Error
      );
    }
  }

  async getAllUserPositions(userAddress: string): Promise<{
    positions: UnifiedPosition[];
    dexBreakdown: Record<DexType, UnifiedPosition[]>;
    errors: Record<DexType, string>;
  }> {
    const enabledAdapters = dexRegistry.getEnabled();
    const allPositions: UnifiedPosition[] = [];
    const dexBreakdown: Record<string, UnifiedPosition[]> = {};
    const errors: Record<string, string> = {};

    const promises = enabledAdapters.map(async (adapter) => {
      try {
        const positions = await adapter.getUserPositions(userAddress);
        dexBreakdown[adapter.dexType] = positions;
        return positions;
      } catch (error) {
        console.error(
          `Failed to fetch positions from ${adapter.dexType}:`,
          error
        );
        errors[adapter.dexType] = (error as Error).message;
        dexBreakdown[adapter.dexType] = [];
        return [];
      }
    });

    const results = await Promise.all(promises);
    results.forEach((positions) => allPositions.push(...positions));

    // Sort by current value (descending)
    allPositions.sort((a, b) => b.currentValueUsd - a.currentValueUsd);

    return {
      positions: allPositions,
      dexBreakdown: dexBreakdown as Record<DexType, UnifiedPosition[]>,
      errors: errors as Record<DexType, string>,
    };
  }

  async getPosition(
    positionAddress: string,
    dexType: DexType,
    context?: PositionContext
  ): Promise<UnifiedPosition> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.getPosition(positionAddress, context);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to get position ${positionAddress} from ${dexType}`,
        dexType,
        "POSITION_FETCH_ERROR",
        error as Error
      );
    }
  }

  async createPosition(
    dexType: DexType,
    params: CreatePositionParams
  ): Promise<TransactionResult> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.createPosition(params);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to create position on ${dexType}`,
        dexType,
        "POSITION_CREATE_ERROR",
        error as Error
      );
    }
  }

  async closePosition(
    positionAddress: string,
    dexType: DexType
  ): Promise<TransactionResult> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.closePosition(positionAddress);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to close position ${positionAddress} on ${dexType}`,
        dexType,
        "POSITION_CLOSE_ERROR",
        error as Error
      );
    }
  }

  async claimFees(
    positionAddress: string,
    dexType: DexType
  ): Promise<TransactionResult> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.claimFees(positionAddress);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to claim fees from position ${positionAddress} on ${dexType}`,
        dexType,
        "FEES_CLAIM_ERROR",
        error as Error
      );
    }
  }

  async rebalancePosition(
    positionAddress: string,
    dexType: DexType,
    params: RebalanceParams
  ): Promise<TransactionResult> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.rebalancePosition(positionAddress, params);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to rebalance position ${positionAddress} on ${dexType}`,
        dexType,
        "POSITION_REBALANCE_ERROR",
        error as Error
      );
    }
  }

  async getUserPortfolio(userAddress: string): Promise<UnifiedPortfolio> {
    const { positions, dexBreakdown, errors } =
      await this.getAllUserPositions(userAddress);

    const totalValueUsd = positions.reduce(
      (sum, pos) => sum + pos.currentValueUsd,
      0
    );

    const totalPnlUsd = positions.reduce((sum, pos) => sum + pos.pnlUsd, 0);

    const totalFeesUsd = positions.reduce(
      (sum, pos) => sum + pos.claimedFeesUsd + pos.unclaimedFeesUsd,
      0
    );

    const totalRewardsUsd = positions.reduce(
      (sum, pos) =>
        sum + (pos.claimedRewardsUsd || 0) + (pos.unclaimedRewardsUsd || 0),
      0
    );

    // Calculate DEX breakdown
    const dexBreakdownSummary: Record<DexType, any> = {} as any;

    for (const [dexType, dexPositions] of Object.entries(dexBreakdown)) {
      dexBreakdownSummary[dexType as DexType] = {
        positions: dexPositions.length,
        valueUsd: dexPositions.reduce(
          (sum, pos) => sum + pos.currentValueUsd,
          0
        ),
        pnlUsd: dexPositions.reduce((sum, pos) => sum + pos.pnlUsd, 0),
      };
    }

    return {
      userAddress,
      positions,
      totalValueUsd,
      totalPnlUsd,
      totalFeesUsd,
      totalRewardsUsd,
      dexBreakdown: dexBreakdownSummary,
    };
  }
}

export const unifiedPositionService = new UnifiedPositionService();
