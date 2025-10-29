import { Keypair, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";

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

/**
 * UnifiedPosition - Raw position data without price/USD/PnL calculations
 * Returned directly from DEX adapters with only on-chain state
 */
export interface UnifiedPosition {
  id: string;
  address: string;
  poolAddress: string;
  dex: DexType;
  type: PoolType;

  // Token information
  tokenA: Token;
  tokenB: Token;

  // Position amounts (raw, in UI units)
  tokenAAmount: string;
  tokenBAmount: string;

  // Position status
  inRange: boolean;
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // DEX-specific metadata
  metadata?: Record<string, any>;
}

/**
 * PositionWithPrices - Enriched position with calculated USD values
 * Created by adding price data to a raw UnifiedPosition
 */
export interface PositionWithPrices extends UnifiedPosition {
  // Current USD values (calculated from current token amounts + prices)
  currentValueUsd: number;
  
  // Fee values in USD (calculated from on-chain fee amounts + prices)
  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  unclaimedRewardsUsd?: number;
  claimedRewardsUsd?: number;
}

/**
 * UserPosition - Complete position view with historical context
 * Combines on-chain position data with database history for PnL calculation
 */
export interface UserPosition extends PositionWithPrices {
  // Historical values from database
  initialValueUsd: number;
  
  // Calculated PnL (requires initial value from DB)
  pnlUsd: number;
  pnlPercentage: number;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  error?: string;
  metadata?: Record<string, any>;
  
  // V2 transaction building support
  transaction?: VersionedTransaction;
  signers?: Keypair[]; // Additional signers beyond the fee payer
  
  // Preview data for UI display before execution
  preview?: {
    // Token amounts and composition
    tokenAAmount?: string;
    tokenBAmount?: string;
    tokenASymbol?: string;
    tokenBSymbol?: string;
    
    // Price range information
    priceRange?: {
      min: string;
      max: string;
      current: string;
    };
    
    // Cost breakdown
    fees?: {
      network?: string; // SOL
      swap?: string; // SOL
      total?: string; // SOL
    };
    
    // Strategy metadata
    strategy?: {
      type: string;
      minBinId: number;
      maxBinId: number;
      activeBinId: number;
      rangeInterval: number;
    };
    
    // Additional metadata
    estimatedValueUsd?: string;
    slippage?: number;
  };
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

/**
 * UnifiedPortfolio - User's portfolio with enriched positions
 * Uses UserPosition which includes both on-chain data and historical context
 */
export interface UnifiedPortfolio {
  userAddress: string;
  positions: UserPosition[];
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
