import Decimal from "decimal.js";
import {
  DexType,
  UnifiedPool,
  UnifiedPosition,
  UnifiedPortfolio,
  TransactionResult,
  CreatePositionResult,
  CreatePositionParams,
  RebalanceParams,
  TrendingParams,
  PaginatedTrendingPools,
  UrlParseResult,
  ClosePositionResult,
  ClosePositionParams,
  ClaimFeesParams,
  ClaimFeesResult,
} from "./core.types";

export interface IDexAdapter {
  readonly dexType: DexType;
  readonly name: string;
  readonly isEnabled: boolean;

  // Pool operations
  getPool(poolId: string): Promise<UnifiedPool>;
  getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools>;
  searchPools(query: string): Promise<UnifiedPool[]>;

  // Position operations
  getUserPositions(userAddress: string): Promise<UnifiedPosition[]>;
  getPosition(
    positionAddress: string,
    poolAddress: string
  ): Promise<UnifiedPosition>;
  getUserPosition(
    userAddress: string,
    positionAddress: string
  ): Promise<UnifiedPosition>;

  createPositionIxs(
    params: CreatePositionParams
  ): Promise<CreatePositionResult>;
  closePositionIxs(params: ClosePositionParams): Promise<ClosePositionResult>;
  claimFeesIxs(params: ClaimFeesParams): Promise<ClaimFeesResult>;

  getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: Decimal;
    toPrice: Decimal;
    activeBinId: number;
    fromBinId: number;
    toBinId: number;
  }>;

  // Portfolio operations
  getUserPortfolio(userAddress: string): Promise<UnifiedPortfolio>;

  // URL parsing
  parsePoolUrl(url: string): UrlParseResult | null;
  isValidPoolUrl(url: string): boolean;

  // Health check
  isHealthy(): Promise<boolean>;
}

export interface IAdvancedDexAdapter extends IDexAdapter {
  // Advanced position management
  getPositionHistory(positionAddress: string): Promise<any[]>;
  getPositionAnalytics(positionAddress: string): Promise<any>;

  // Yield farming
  getYieldFarms(): Promise<any[]>;
  stakeInFarm(farmId: string, amount: string): Promise<TransactionResult>;
  unstakeFromFarm(farmId: string, amount: string): Promise<TransactionResult>;

  // Advanced pool features
  getPoolAnalytics(poolId: string): Promise<any>;
  getPoolHistory(poolId: string): Promise<any[]>;
}
