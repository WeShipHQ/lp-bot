import {
  UnifiedPool,
  UnifiedPosition,
  DexType,
  PoolType,
  Token,
} from "@/types/core.types";
import {
  MeteoraDlmmPoolResponse,
  MeteoraDammV1PoolResponse,
  MeteoraDammV2PoolResponse,
} from "@/types/meteora.types";
import {
  TokenPriceService,
  getTokenPriceService,
} from "@/services/token-price.service";
import { JupiterService } from "@/services/jupiter.service";

export interface PositionTransformContext {
  poolAddress: string;
  positionAddress: string;
  tokenA: Token;
  tokenB: Token;
  positionData: any;
  lbPairInfo: {
    activeId?: number;
    binStep?: number;
  };
  metadataExtras?: Record<string, unknown>;
}

/**
 * MeteoraTransformers
 *
 * Centralized transformation logic for Meteora DEX data structures.
 * Converts API responses and on-chain data into UnifiedPool and UnifiedPosition formats.
 *
 * **Responsibilities:**
 * - Transform DLMM/DAMM pool data → UnifiedPool
 * - Transform position data (API and on-chain) → UnifiedPosition
 * - Normalize numeric values and timestamps
 * - Calculate derived metrics (APY, fee ratios, USD values)
 * - Extract and enrich token metadata
 *
 * **Design Principles:**
 * - Pure transformation logic (no side effects except external service calls)
 * - Defensive fallbacks for missing/malformed data
 * - Explicit units and assumptions in JSDoc
 * - Type-safe transformations with clear inputs/outputs
 *
 * **Usage:**
 * ```typescript
 * const transformers = new MeteoraTransformers();
 *
 * // Transform API pool to unified format
 * const pool = await transformers.toUnifiedPool(dlmmPoolResponse);
 *
 * // Transform on-chain position to unified format
 * const position = transformers.onChainToUnifiedPosition(context);
 * ```
 */
export class MeteoraTransformers {
  private readonly dexType: DexType = "meteora";
  private readonly jupiter: JupiterService;

  constructor(deps?: { jupiterService?: JupiterService }) {
    this.jupiter = deps?.jupiterService ?? new JupiterService();
  }

  /**
   * Transform Meteora DLMM API response to UnifiedPool
   *
   * **Data Source:** Meteora DLMM API (`/pair/:poolAddress`)
   *
   * **Assumptions:**
   * - `liquidity` field represents TVL in lamports (9 decimals)
   * - `current_price` is in token Y per token X
   * - `volume` and `fees` objects contain hourly breakdown
   * - `fee_tvl_ratio` object contains hourly fee/TVL ratios
   *
   * **Fallbacks:**
   * - Missing APY: Falls back to APR if available, else 0
   * - Missing decimals: Uses Jupiter token metadata
   * - Missing volume/fees: Defaults to 0
   * - Unverified tokens: `isVerified = false`
   *
   * @param data - DLMM pool response from Meteora API
   * @returns Unified pool structure with normalized fields
   */
  async toUnifiedPool(data: MeteoraDlmmPoolResponse): Promise<UnifiedPool> {
    const { tokenX: tokenA, tokenY: tokenB } =
      await this.jupiter.getTokenPairInfo(data.mint_x, data.mint_y);

    const volume24h = this.toNumeric(data.trade_volume_24h) ?? 0;
    const fees24h = this.toNumeric(data.fees_24h) ?? 0;
    const feeTvlRatio24h = this.calculateFeeRatio(data);

    return {
      id: data.address,
      address: data.address,
      name: data.name,
      dex: this.dexType,
      type: "DLMM",
      tokenA,
      tokenB,

      // Core metrics (amounts in lamports for liquidity, USD for TVL)
      liquidity: String(data.liquidity ?? "0"),
      tvl: String(data.liquidity ?? "0"),
      apr: this.toNumeric(data.apr) ?? 0,
      apy: this.calculateApy(data),
      currentPrice: this.toNumeric(data.current_price) ?? 0,
      isVerified: data.is_verified,

      // Time-based metrics (USD amounts)
      volume24h,
      fees24h,
      feeTvlRatio24h,

      // Extended metrics (USD amounts for fees/volume)
      volume: {
        hour1: this.toNumeric((data.volume as any)?.hour_1) ?? 0,
        hour4: this.toNumeric((data.volume as any)?.hour_4) ?? 0,
        hour12: this.toNumeric((data.volume as any)?.hour_12) ?? 0,
        hour24: this.toNumeric((data.volume as any)?.hour_24) ?? 0,
      },
      fees: {
        hour1: this.toNumeric((data.fees as any)?.hour_1) ?? 0,
        hour4: this.toNumeric((data.fees as any)?.hour_4) ?? 0,
        hour12: this.toNumeric((data.fees as any)?.hour_12) ?? 0,
        hour24: this.toNumeric((data.fees as any)?.hour_24) ?? 0,
      },

      // DEX-specific metadata (preserved for debugging/advanced features)
      metadata: {
        base_fee_percentage: data.base_fee_percentage,
        bin_step: data.bin_step,
        farm_apr: data.farm_apr,
        farm_apy: data.farm_apy,
        launchpad: data.launchpad,
        max_fee_percentage: data.max_fee_percentage,
        protocol_fee_percentage: data.protocol_fee_percentage,
        reserve_x: data.reserve_x,
        reserve_y: data.reserve_y,
        tags: data.tags,
      },
    };
  }

  /**
   * Transform Meteora DAMM v1 API response to UnifiedPool
   *
   * **Data Source:** Meteora DAMM v1 API (`/pools?address=...`)
   *
   * **Assumptions:**
   * - `pool_tvl` is in USD
   * - `daily_base_apy` is annualized percentage (string)
   * - `farming_apy` is additional yield from farms (string)
   * - `trade_apy` is yield from trading fees (string)
   * - `pool_token_mints[0]` is tokenA, `[1]` is tokenB
   *
   * **Fallbacks:**
   * - Missing APY: Sums base + farming + trade APY, defaults to 0
   * - Missing volumes: Not available in v1 API, defaults to 0
   * - Current price: Calculated from token amounts if available
   *
   * @param data - DAMM v1 pool response from Meteora API
   * @returns Unified pool structure with normalized fields
   */
  async toUnifiedPoolFromDammV1(
    data: MeteoraDammV1PoolResponse
  ): Promise<UnifiedPool> {
    const tokenMints = data.pool_token_mints || [];
    const mintA = tokenMints[0] || "";
    const mintB = tokenMints[1] || "";

    const { tokenX: tokenA, tokenY: tokenB } =
      await this.jupiter.getTokenPairInfo(mintA, mintB);

    // Parse APY components (all in string percentage format like "12.5")
    const baseApy = parseFloat(data.daily_base_apy || "0");
    const farmApy = parseFloat(data.farming_apy || "0");
    const tradeApy = parseFloat(data.trade_apy || "0");
    const totalApy = baseApy + farmApy + tradeApy;

    // TVL is already in USD
    const tvlUsd = parseFloat(data.pool_tvl || "0");

    // Calculate current price from token amounts if available
    const tokenAmounts = data.pool_token_usd_amounts || [];
    const amountAUsd = parseFloat(tokenAmounts[0] || "0");
    const amountBUsd = parseFloat(tokenAmounts[1] || "0");
    const tokenAmountsRaw = data.pool_token_amounts || [];
    const amountA = parseFloat(tokenAmountsRaw[0] || "0");
    const amountB = parseFloat(tokenAmountsRaw[1] || "0");

    // Price = tokenB/tokenA (Y per X)
    let currentPrice = 0;
    if (amountA > 0 && amountB > 0) {
      currentPrice = amountB / amountA;
    }

    return {
      id: data.pool_address,
      address: data.pool_address,
      name: data.pool_name || `${tokenA.symbol}-${tokenB.symbol}`,
      dex: this.dexType,
      type: "DAMM",
      tokenA,
      tokenB,

      // Core metrics
      liquidity: String(tvlUsd),
      tvl: String(tvlUsd),
      apr: totalApy, // DAMM v1 reports APY, use as APR fallback
      apy: totalApy,
      currentPrice,
      isVerified: !data.unknown, // Inverse of "unknown" flag

      // Time-based metrics (not available in DAMM v1 API)
      volume24h: this.toNumeric(data.trading_volume) ?? 0,
      fees24h: this.toNumeric(data.fee_volume) ?? 0,
      feeTvlRatio24h: 0,

      // Extended metrics (not available)
      volume: {
        hour1: 0,
        hour4: 0,
        hour12: 0,
        hour24: this.toNumeric(data.trading_volume) ?? 0,
      },
      fees: {
        hour1: 0,
        hour4: 0,
        hour12: 0,
        hour24: this.toNumeric(data.fee_volume) ?? 0,
      },

      // DEX-specific metadata
      metadata: {
        poolVersion: data.pool_version,
        lpMint: data.lp_mint,
        lpDecimal: data.lp_decimal,
        totalFeePct: data.total_fee_pct,
        farmingPool: data.farming_pool,
        farmTvl: data.farm_tvl,
        farmExpire: data.farm_expire,
        isForex: data.is_forex,
        isLst: data.is_lst,
        permissioned: data.permissioned,
      },
    };
  }

  /**
   * Transform Meteora DAMM v2 API response to UnifiedPool
   *
   * **Data Source:** Meteora DAMM v2 API (`/pools/:poolAddress`)
   *
   * **Assumptions:**
   * - `data.tvl` is in USD
   * - `data.apr` is annualized percentage (number)
   * - `data.fee_tvl_ratio` is 24h ratio (number)
   * - `data.pool_price` is current price in tokenB per tokenA
   *
   * **Fallbacks:**
   * - Missing APR: Defaults to 0
   * - Missing fee_tvl_ratio: Defaults to 0
   * - Volumes/fees: Not exposed in v2 API, defaults to 0
   *
   * @param response - DAMM v2 pool response from Meteora API (includes status + data)
   * @returns Unified pool structure with normalized fields
   */
  async toUnifiedPoolFromDammV2(
    response: MeteoraDammV2PoolResponse
  ): Promise<UnifiedPool> {
    const data = response.data;

    const { tokenX: tokenA, tokenY: tokenB } =
      await this.jupiter.getTokenPairInfo(data.token_a_mint, data.token_b_mint);

    return {
      id: data.pool_address,
      address: data.pool_address,
      name: data.pool_name || `${data.token_a_symbol}-${data.token_b_symbol}`,
      dex: this.dexType,
      type: "DAMM",
      tokenA,
      tokenB,

      // Core metrics (TVL already in USD)
      liquidity: String(data.liquidity ?? "0"),
      tvl: String(data.tvl ?? "0"),
      apr: this.toNumeric(data.apr) ?? 0,
      apy: this.toNumeric(data.apr) ?? 0, // v2 only exposes APR
      currentPrice: this.toNumeric(data.pool_price) ?? 0,
      isVerified: true, // DAMM v2 pools are curated

      // Time-based metrics (limited in v2 API)
      volume24h: 0, // Not exposed
      fees24h: 0, // Not exposed
      feeTvlRatio24h: this.toNumeric(data.fee_tvl_ratio) ?? 0,

      // Extended metrics (not available)
      volume: undefined,
      fees: undefined,

      // DEX-specific metadata
      metadata: {
        creator: data.creator,
        tokenAVault: data.token_a_vault,
        tokenBVault: data.token_b_vault,
        alphaVault: data.alpha_vault,
        sqrtMinPrice: data.sqrt_min_price,
        sqrtMaxPrice: data.sqrt_max_price,
        minPrice: data.min_price,
        maxPrice: data.max_price,
        sqrtPrice: data.sqrt_price,
        virtualPrice: data.virtual_price,
        poolType: data.pool_type,
        permanentLockLiquidity: data.permanent_lock_liquidity,
        tokenAAmount: data.token_a_amount,
        tokenBAmount: data.token_b_amount,
        createdAtSlot: data.created_at_slot,
        createdAtSlotTimestamp: data.created_at_slot_timestamp,
      },
    };
  }

  /**
   * Transform on-chain DLMM position data to UnifiedPosition
   *
   * **Data Source:** DLMM SDK `getPosition()` or `getAllLbPairPositionsByUser()`
   *
   * **Assumptions:**
   * - Token amounts are in raw lamports (use token decimals to convert)
   * - Fee amounts include both `feeX/feeY` and optional `feeXExcludeTransferFee` variants
   * - `lowerBinId` and `upperBinId` define the position's price range
   * - `activeId` from lbPairInfo determines if position is in range
   *
   * **Fallbacks:**
   * - Missing initial value: Sets equal to current value (unknown at transform time)
   * - Missing claimed fees: Defaults to 0
   * - Missing timestamps: Uses current time or provided values
   * - Rewards: Defaults to 0 (DLMM v1 positions may not have rewards)
   *
   * **Units:**
   * - tokenAAmount/tokenBAmount: UI amounts (string, after decimal conversion)
   * - currentValueUsd: USD (number)
   * - unclaimedFeesUsd/claimedFeesUsd: USD (number)
   * - PnL: Set to 0 (requires historical data from database)
   *
   * @param context - Position transformation context with all required fields
   * @returns Unified position structure with normalized fields
   */
  onChainToUnifiedPosition(context: PositionTransformContext): UnifiedPosition {
    const {
      poolAddress,
      positionAddress,
      tokenA,
      tokenB,
      positionData,
      lbPairInfo,
      metadataExtras,
    } = context;

    const totalXRaw =
      positionData.totalXAmountExcludeTransferFee ??
      positionData.totalXAmount ??
      0;
    const totalYRaw =
      positionData.totalYAmountExcludeTransferFee ??
      positionData.totalYAmount ??
      0;

    const tokenAAmountUi = this.fromRawAmount(totalXRaw, tokenA.decimals);
    const tokenBAmountUi = this.fromRawAmount(totalYRaw, tokenB.decimals);

    const lowerBinId =
      this.toNumeric(positionData.lowerBinId ?? positionData.binLower) ?? 0;
    const upperBinId =
      this.toNumeric(positionData.upperBinId ?? positionData.binUpper) ?? 0;
    const activeId = this.toNumeric(lbPairInfo.activeId) ?? 0;
    const binStepBps = this.toNumeric(lbPairInfo.binStep) ?? 0;

    const inRange = activeId >= lowerBinId && activeId <= upperBinId;

    const updatedAt = this.toDate(
      positionData.lastUpdatedAt ?? positionData.updatedAt ?? Date.now()
    );
    const createdAt = this.toDate(positionData.createdAt ?? updatedAt);

    return {
      id: `${poolAddress}-${positionAddress}`,
      address: positionAddress,
      poolAddress,
      dex: this.dexType,
      type: "DLMM",
      tokenA,
      tokenB,

      // Position amounts (UI format as strings)
      tokenAAmount: tokenAAmountUi.toString(),
      tokenBAmount: tokenBAmountUi.toString(),

      // Position status
      inRange,
      isActive: true,

      // Timestamps
      createdAt,
      updatedAt,

      // DEX-specific metadata
      metadata: {
        binStepBps,
        activeId,
        lowerBinId,
        upperBinId,
        ...(metadataExtras ?? {}),
      },
    };
  }


  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate APY from pool data
   *
   * **Calculation Logic:**
   * 1. If `apy` field exists, use it directly
   * 2. Else if `apr` field exists, convert APR → APY (assuming daily compounding)
   * 3. Else default to 0
   *
   * **APR to APY Formula:**
   * APY = (1 + APR/365)^365 - 1
   *
   * **Assumptions:**
   * - APR and APY values are in percentage form (e.g., 45.2 means 45.2%)
   * - Daily compounding is standard for DeFi yields
   *
   * @param data - Pool data containing apy or apr fields
   * @returns APY as percentage number (e.g., 45.2)
   */
  calculateApy(data: any): number {
    const apy = this.toNumeric(data.apy);
    if (apy != null) return apy;

    const apr = this.toNumeric(data.apr);
    if (apr != null && apr > 0) {
      // Convert APR to APY with daily compounding
      // APY = (1 + APR/100/365)^365 - 1) * 100
      const apyDecimal = Math.pow(1 + apr / 100 / 365, 365) - 1;
      return apyDecimal * 100;
    }

    return 0;
  }

  /**
   * Calculate 24-hour fee/TVL ratio
   *
   * **Calculation Logic:**
   * - If `fee_tvl_ratio.hour_24` exists, use it directly
   * - Else if `fee_tvl_ratio` is a number, use it (some APIs return direct value)
   * - Else if both `fees_24h` and `liquidity` are available, calculate: fees_24h / liquidity
   * - Else default to 0
   *
   * **Assumptions:**
   * - Ratio is in decimal form (e.g., 0.0065 means 0.65%)
   * - `fees_24h` and `liquidity` must be in same units (USD or lamports)
   *
   * @param data - Pool data containing fee_tvl_ratio or fees/liquidity fields
   * @returns Fee/TVL ratio as decimal number (e.g., 0.0065 for 0.65%)
   */
  calculateFeeRatio(data: any): number {
    // Check for nested object format
    if (typeof data.fee_tvl_ratio === "object" && data.fee_tvl_ratio) {
      const ratio = this.toNumeric(data.fee_tvl_ratio.hour_24);
      if (ratio != null) return ratio;
    }

    // Check for direct numeric value
    const ratio = this.toNumeric(data.fee_tvl_ratio);
    if (ratio != null) return ratio;

    // Fallback: calculate from fees and liquidity
    const fees24h = this.toNumeric(data.fees_24h);
    const liquidity = this.toNumeric(data.liquidity);
    if (fees24h != null && liquidity != null && liquidity > 0) {
      return fees24h / liquidity;
    }

    return 0;
  }

  /**
   * Check if pool is verified
   *
   * **Verification Criteria:**
   * - `is_verified` field is truthy
   * - OR `hide` field is falsy (not hidden)
   * - AND `is_blacklisted` field is falsy (not blacklisted)
   *
   * **Assumptions:**
   * - Verified pools have both tokens with metadata registered
   * - Blacklisted pools should never be considered verified
   * - Hidden pools may still be verified but not shown in UI
   *
   * @param data - Pool data containing verification flags
   * @returns true if pool is verified, false otherwise
   */
  isVerifiedPool(data: any): boolean {
    const isVerified = !!data.is_verified;
    const isBlacklisted = !!data.is_blacklisted;
    const isHidden = !!data.hide;

    // Pool must be verified and not blacklisted
    // Hidden status doesn't affect verification
    return isVerified && !isBlacklisted;
  }

  /**
   * Convert raw token amount to UI amount
   *
   * **Conversion:** raw_amount / (10 ^ decimals)
   *
   * **Examples:**
   * - 1_000_000 raw with 6 decimals = 1.0 UI
   * - 1_000_000_000 raw with 9 decimals = 1.0 UI (SOL)
   *
   * **Assumptions:**
   * - Raw amount is always in smallest unit (lamports/atoms)
   * - Decimals must match token's on-chain decimals
   *
   * **Fallbacks:**
   * - null/undefined raw: Returns 0
   * - Invalid decimals: Uses 0 (returns raw amount)
   *
   * @param raw - Raw amount as string, bigint, or number
   * @param decimals - Token decimals (0-18 typically)
   * @returns UI amount as number (may lose precision for very large amounts)
   */
  fromRawAmount(raw?: string | bigint | number, decimals = 0): number {
    const value = raw == null ? 0 : Number(raw.toString());
    return value / Math.pow(10, decimals || 0);
  }

  /**
   * Normalize various numeric types to number
   *
   * **Supported Input Types:**
   * - number: Returns as-is
   * - bigint: Converts to number (precision loss for large values)
   * - string: Parses as number
   * - Date: Returns timestamp (milliseconds)
   * - Objects with toNumber() or toString() methods
   *
   * **Fallbacks:**
   * - null/undefined: Returns undefined
   * - NaN/Infinity: Returns undefined
   * - Unparseable strings: Returns undefined
   *
   * @param value - Value to convert to numeric
   * @returns Numeric value or undefined if conversion fails
   */
  toNumeric(value: any): number | undefined {
    if (value == null) return undefined;
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value instanceof Date) return value.getTime();
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    if (typeof value === "object") {
      // Try toNumber() method (BN, Decimal, etc.)
      if (typeof (value as any).toNumber === "function") {
        const num = (value as any).toNumber();
        return typeof num === "number" && Number.isFinite(num)
          ? num
          : undefined;
      }
      // Try toString() then parse
      if (typeof (value as any).toString === "function") {
        const parsed = Number((value as any).toString());
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  /**
   * Normalize various timestamp formats to Date object
   *
   * **Supported Input Types:**
   * - Date: Returns as-is
   * - number/bigint/string: Interprets as timestamp
   *
   * **Timestamp Interpretation:**
   * - value > 1e12: Milliseconds since epoch (JavaScript standard)
   * - value > 1e9: Seconds since epoch (Unix timestamp)
   * - value > 1e5: Assumes seconds (small Unix timestamps)
   * - value < 1e5: Treats as milliseconds (unlikely to be seconds)
   *
   * **Fallbacks:**
   * - null/undefined: Returns current time
   * - Invalid numeric: Returns current time
   * - Unparseable: Returns current time
   *
   * @param value - Timestamp value to convert
   * @returns Date object representing the timestamp
   */
  toDate(value: any): Date {
    if (value instanceof Date) {
      return value;
    }

    const numeric = this.toNumeric(value);
    if (numeric == null) {
      return new Date();
    }

    // Milliseconds (JavaScript standard)
    if (numeric > 1e12) {
      return new Date(numeric);
    }

    // Seconds (Unix timestamp)
    if (numeric > 1e9) {
      return new Date(numeric * 1000);
    }

    // Small timestamps - assume seconds
    if (numeric > 1e5) {
      return new Date(numeric * 1000);
    }

    // Very small - treat as milliseconds
    return new Date(numeric);
  }

  /**
   * Get DEX type identifier
   * @returns "meteora"
   */
  getDexType(): DexType {
    return this.dexType;
  }
}

/**
 * Singleton instance for convenience
 */
export const meteoraTransformers = new MeteoraTransformers();
