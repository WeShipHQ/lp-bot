import { Keypair, TransactionInstruction } from "@solana/web3.js";

export type DexType = "meteora" | "saros" | "orca" | "raydium";
export type PoolType = "DLMM" | "DAMM" | "CLMM" | "AMM";

export interface UnifiedPool {
  id: string;
  address: string;
  name: string;
  dex: DexType;
  type: PoolType;
  tokenA: Token;
  tokenB: Token;

  // Core metrics
  liquidity: string;
  tvl: string;
  apr: number;
  apy: number;
  currentPrice: number;
  isVerified: boolean;

  // Time-based metrics
  volume24h: number;
  fees24h: number;
  feeTvlRatio24h: number;

  // Optional extended metrics
  volume?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };

  fees?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };

  // DEX-specific metadata (stored as JSON)
  metadata?: Record<string, any>;
}

export interface UnifiedPosition {
  id: string;
  address: string;
  poolAddress: string;
  dex: DexType;
  type: PoolType;

  // Token information
  tokenA: Token;
  tokenB: Token;

  // Position amounts
  tokenAAmount: string;
  tokenBAmount: string;

  // USD values
  currentValueUsd: number;
  initialValueUsd: number;

  // Fees and rewards
  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  unclaimedRewardsUsd?: number;
  claimedRewardsUsd?: number;

  // PnL
  pnlUsd: number;
  pnlPercentage: number;

  // Position status
  inRange: boolean;
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // DEX-specific metadata
  metadata?: Record<string, any>;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface CreatePositionResult {
  success: boolean;
  instructions: TransactionInstruction[];
  positionKp: Keypair;
  error?: string;
}

export interface CreatePositionParams {
  poolAddress: string;
  userAddress: string;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  slippage?: number;
  rangeInterval?: number;
}

export interface RebalanceParams {
  newStrategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}

export type TrendingPoolsSortCriteria =
  | "apy"
  | "tvl"
  | "volume24h"
  | "fee_tvl_ratio";

export interface TrendingParams {
  page?: number;
  limit?: number;
  sortBy?: TrendingPoolsSortCriteria;
  sortOrder?: "asc" | "desc";
  minTvl?: number;
  verified?: boolean;
}

export interface PaginatedTrendingPools {
  pools: UnifiedPool[];
  currentPage: number;
  totalPages: number;
  sortBy: TrendingPoolsSortCriteria;
}

export interface UnifiedPortfolio {
  userAddress: string;
  positions: UnifiedPosition[];
  totalValueUsd: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  totalRewardsUsd?: number;
  dexBreakdown: Record<
    DexType,
    {
      positions: number;
      valueUsd: number;
      pnlUsd: number;
    }
  >;
}

export interface UrlParseResult {
  dex: DexType;
  poolId: string;
  poolType?: PoolType;
}

export class DexAdapterError extends Error {
  constructor(
    message: string,
    public dex: DexType,
    public code?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = "DexAdapterError";
  }
}

export interface ClosePositionParams {
  poolAddress: string;
  userAddress: string;
  positionAddress: string;
}

export interface ClosePositionResult {
  success: boolean;
  instructions: TransactionInstruction[];
  error?: string;
}

export interface ClaimFeesParams {
  poolAddress: string;
  userAddress: string;
  positionAddress: string;
}

export interface ClaimFeesResult {
  success: boolean;
  instructions: TransactionInstruction[];
  error?: string;
}

// tokens
export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

export interface TokenPrice {
  id: string;
  timestamp: number;
  price: number;
  blockId: number;
  decimals: number;
  priceChange24h: number;
}
