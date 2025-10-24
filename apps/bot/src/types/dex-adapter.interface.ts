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
} from "./core.types";

export interface PositionContext {
  poolAddress?: string;
  userAddress?: string;
}

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
    context?: PositionContext
  ): Promise<UnifiedPosition>;
  createPosition(params: CreatePositionParams): Promise<TransactionResult>;
  createPositionIx(params: CreatePositionParams): Promise<CreatePositionResult>;
  closePosition(positionAddress: string): Promise<TransactionResult>;
  closePositionIx(params: ClosePositionParams): Promise<ClosePositionResult>;
  claimFees(positionAddress: string): Promise<TransactionResult>;
  rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult>;

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
