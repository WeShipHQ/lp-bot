import { IDexAdapter, PositionContext } from "@/types/dex-adapter.interface";
import {
  DexType,
  UnifiedPool,
  UnifiedPosition,
  UnifiedPortfolio,
  TransactionResult,
  CreatePositionParams,
  RebalanceParams,
  TrendingParams,
  PaginatedTrendingPools,
  UrlParseResult,
  DexAdapterError,
  CreatePositionResult,
  ClosePositionParams,
  ClosePositionResult,
  ClaimFeesParams,
  ClaimFeesResult,
} from "../types/core.types";
import Decimal from "decimal.js";

export abstract class BaseDexAdapter implements IDexAdapter {
  abstract readonly dexType: DexType;
  abstract readonly name: string;
  public readonly isEnabled: boolean = true;

  abstract getPool(poolId: string): Promise<UnifiedPool>;
  abstract getTrendingPools(
    params?: TrendingParams
  ): Promise<PaginatedTrendingPools>;
  abstract searchPools(query: string): Promise<UnifiedPool[]>;

  abstract getUserPositions(userAddress: string): Promise<UnifiedPosition[]>;
  abstract getUserPosition(
    userAddress: string,
    positionAddress: string
  ): Promise<UnifiedPosition>;
  abstract getPosition(
    positionAddress: string,
    context?: PositionContext
  ): Promise<UnifiedPosition>;

  abstract createPositionIxs(
    params: CreatePositionParams
  ): Promise<CreatePositionResult>;

  abstract closePositionIxs(
    params: ClosePositionParams
  ): Promise<ClosePositionResult>;
  abstract claimFeesIxs(params: ClaimFeesParams): Promise<ClaimFeesResult>;

  abstract getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: Decimal;
    toPrice: Decimal;
    activeBinId: number;
    fromBinId: number;
    toBinId: number;
  }>;

  abstract parsePoolUrl(url: string): UrlParseResult | null;

  async getUserPortfolio(userAddress: string): Promise<UnifiedPortfolio> {
    try {
      const positions = await this.getUserPositions(userAddress);

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

      return {
        userAddress,
        positions,
        totalValueUsd,
        totalPnlUsd,
        totalFeesUsd,
        totalRewardsUsd,
        dexBreakdown: {
          [this.dexType]: {
            positions: positions.length,
            valueUsd: totalValueUsd,
            pnlUsd: totalPnlUsd,
          },
        } as any,
      };
    } catch (error) {
      throw new DexAdapterError(
        `Failed to get portfolio for ${this.dexType}`,
        this.dexType,
        "PORTFOLIO_ERROR",
        error as Error
      );
    }
  }

  isValidPoolUrl(url: string): boolean {
    return this.parsePoolUrl(url) !== null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      // Basic health check - try to get trending pools
      await this.getTrendingPools({ limit: 1 });
      return true;
    } catch (error) {
      console.error(`Health check failed for ${this.dexType}:`, error);
      return false;
    }
  }

  protected handleError(error: any, operation: string): never {
    throw new DexAdapterError(
      `${operation} failed for ${this.dexType}: ${error.message}`,
      this.dexType,
      "OPERATION_ERROR",
      error
    );
  }

  protected validateAmount(amount: string): void {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new DexAdapterError(
        `Invalid amount: ${amount}`,
        this.dexType,
        "INVALID_AMOUNT"
      );
    }
  }
}
