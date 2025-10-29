/**
 * Strategy Pattern Types for LP Position Creation
 * 
 * This module defines the core abstractions for liquidity provision strategies,
 * enabling modular strategy implementation and cross-DEX compatibility.
 */

import { DexType, Token } from "@/types/core.types";

/**
 * Core strategy identifiers
 * These must be exhaustive to enable compile-time checks
 */
export type StrategyName = "spot" | "curve" | "bid-ask";

/**
 * Deposit methods supported by strategies
 */
export type DepositMode =
  | "sol_auto_convert"
  | "single_token_a"
  | "single_token_b";

/**
 * Token requirements for a strategy
 */
export interface TokenRequirement {
  /** Token identifier (A or B) */
  token: "A" | "B";
  /** Whether this token is required for the strategy */
  required: boolean;
  /** Minimum amount required (if any) */
  minAmount?: number;
}

/**
 * Swap plan for converting SOL or one token to required tokens
 */
export interface SwapPlan {
  /** Input token mint address */
  inputMint: string;
  /** Output token mint address */
  outputMint: string;
  /** Amount to swap (in UI units) */
  amount: number;
  /** Expected output amount (in UI units) */
  expectedOutput: number;
}

/**
 * Deposit plan produced by a strategy
 * Contains all information needed to execute deposits and swaps
 */
export interface DepositPlan {
  /** Deposit mode being used */
  mode: DepositMode;
  
  /** Token A amount (in UI units) */
  tokenAAmount: number;
  
  /** Token B amount (in UI units) */
  tokenBAmount: number;
  
  /** Swap operations required (if any) */
  swaps?: SwapPlan[];
  
  /** Price range for the position (if applicable) */
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };
  
  /** Estimated fees for the operation */
  estimatedFees?: {
    /** Transaction fees in SOL */
    transactionFee: number;
    /** Swap fees (if applicable) */
    swapFees?: number;
    /** Platform fees (if applicable) */
    platformFee?: number;
  };
}

/**
 * Strategy validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warning messages (non-blocking) */
  warnings?: string[];
}

/**
 * Parameters for deposit plan calculation
 */
export interface CalculateDepositPlanParams {
  /** Pool address */
  poolAddress: string;
  
  /** DEX type */
  dex: DexType;
  
  /** Token A information */
  tokenA: Token;
  
  /** Token B information */
  tokenB: Token;
  
  /** Current pool price (token B per token A) */
  currentPrice: number;
  
  /** Deposit mode */
  depositMode: DepositMode;
  
  /** SOL amount (if using balanced mode) */
  solAmount?: number;
  
  /** Token A amount (if single-sided-a) */
  tokenAAmount?: number;
  
  /** Token B amount (if single-sided-b) */
  tokenBAmount?: number;
  
  /** Price change percentage (for single-sided range calculation) */
  priceChangePercentage?: number;
  
  /** Custom range interval (overrides default) */
  rangeInterval?: number;
  
  /** Slippage tolerance (default: 0.5%) */
  slippage?: number;
}

/**
 * Strategy metadata describing capabilities and requirements
 */
export interface StrategyMetadata {
  /** Strategy name */
  name: StrategyName;
  
  /** Display name for UI */
  displayName: string;
  
  /** Short description */
  description: string;
  
  /** Detailed explanation */
  details: string;
  
  /** Supported deposit modes */
  supportedDepositModes: DepositMode[];
  
  /** Token requirements */
  tokenRequirements: {
    balanced: TokenRequirement[];
    singleSidedA?: TokenRequirement[];
    singleSidedB?: TokenRequirement[];
  };
  
  /** Recommended use cases */
  recommendedFor: string[];
  
  /** Risk level (1-5, where 5 is highest risk) */
  riskLevel: 1 | 2 | 3 | 4 | 5;
  
  /** Whether this strategy is beginner-friendly */
  beginnerFriendly: boolean;
  
  /** Default range interval (in bins for DLMM) */
  defaultRangeInterval: number;
  
  /** Compatible DEXes */
  compatibleDexes: DexType[];
}

/**
 * Parameters for strategy validation
 */
export interface ValidateStrategyParams {
  /** Deposit mode being validated */
  depositMode: DepositMode;
  
  /** Token A amount (if provided) */
  tokenAAmount?: number;
  
  /** Token B amount (if provided) */
  tokenBAmount?: number;
  
  /** SOL amount (if provided) */
  solAmount?: number;
  
  /** User's token A balance */
  tokenABalance?: number;
  
  /** User's token B balance */
  tokenBBalance?: number;
  
  /** User's SOL balance */
  solBalance?: number;
  
  /** Minimum required for protocol */
  minimumDeposit?: number;
}

/**
 * DEX-specific strategy parameters
 * Different DEXes may require different parameters for the same strategy
 */
export interface DexStrategyParams {
  /** DEX type */
  dex: DexType;
  
  /** Strategy-specific parameters (e.g., bin IDs for DLMM) */
  params: Record<string, any>;
}

/**
 * Core interface for LP strategies
 * All strategies must implement this interface
 */
export interface ILPStrategy {
  /** Strategy metadata */
  readonly metadata: StrategyMetadata;
  
  /**
   * Validate strategy parameters before calculation
   * 
   * @param params - Validation parameters
   * @returns Validation result with any errors or warnings
   */
  validate(params: ValidateStrategyParams): Promise<ValidationResult>;
  
  /**
   * Calculate deposit plan for the given parameters
   * 
   * @param params - Calculation parameters
   * @returns Complete deposit plan with amounts, swaps, and fees
   */
  calculateDepositPlan(params: CalculateDepositPlanParams): Promise<DepositPlan>;
  
  /**
   * Get DEX-specific parameters for position creation
   * 
   * @param dex - Target DEX
   * @param depositPlan - The calculated deposit plan
   * @returns DEX-specific parameters
   */
  getDexParams(dex: DexType, depositPlan: DepositPlan): Promise<DexStrategyParams>;
  
  /**
   * Check if strategy supports the given DEX
   * 
   * @param dex - DEX to check
   * @returns Whether the strategy supports this DEX
   */
  supportsDex(dex: DexType): boolean;
  
  /**
   * Check if strategy supports the given deposit mode
   * 
   * @param mode - Deposit mode to check
   * @returns Whether the strategy supports this mode
   */
  supportsDepositMode(mode: DepositMode): boolean;
}
