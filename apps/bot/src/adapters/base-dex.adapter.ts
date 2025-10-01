import { IDexAdapter } from "@/types/dex-adapter.interface";
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
} from "../types/core.types";

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
  abstract getPosition(positionAddress: string): Promise<UnifiedPosition>;
  abstract createPosition(
    params: CreatePositionParams
  ): Promise<TransactionResult>;
  abstract closePosition(positionAddress: string): Promise<TransactionResult>;
  abstract claimFees(positionAddress: string): Promise<TransactionResult>;
  abstract rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult>;
  abstract parsePoolUrl(url: string): UrlParseResult | null;

  // Default implementations
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

  // Utility methods for error handling
  protected handleError(error: any, operation: string): never {
    throw new DexAdapterError(
      `${operation} failed for ${this.dexType}: ${error.message}`,
      this.dexType,
      "OPERATION_ERROR",
      error
    );
  }

  protected validateAddress(address: string): void {
    if (!address || address.length < 32) {
      throw new DexAdapterError(
        `Invalid address: ${address}`,
        this.dexType,
        "INVALID_ADDRESS"
      );
    }
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
