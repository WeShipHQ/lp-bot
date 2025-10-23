import type { PoolDex, PoolType } from "@/types/pool.types";
import type { Token } from "@/types/token.types";
import type {
  SarosDlmmPool,
  SarosDlmmPoolDetail,
  SarosPoolPosition,
} from "./types";
import {
  CreatePositionParams,
  DexType,
  RebalanceParams,
  TransactionResult,
  TrendingParams,
  PaginatedTrendingPools,
  UnifiedPool,
  UnifiedPosition,
  UrlParseResult,
  CreatePositionResult,
} from "@/types/core.types";
import type { PositionContext } from "@/types/dex-adapter.interface";
import { SarosPoolService } from "./pool.service";
import { TRENDING_CONSTANTS } from "@/config/constants";
import { SarosDlmmService } from "./dlmm.service";
import { BaseDexAdapter } from "@/adapters/base-dex.adapter";

/**
 * SarosAdapter
 * Implements IDexAdapter for Saros DLMM pools.
 * - Transforms Saros API/SDK responses to Unified types
 * - Provides trending/search/positions endpoints, reusing Saros services
 */
export class SarosAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "saros";
  readonly name: string = "Saros";

  // URL patterns for Saros
  private readonly urlPatterns = {
    dlmm: /^https:\/\/(?:www\.)?saros\.xyz\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
  };

  private readonly sarosPoolService = new SarosPoolService();
  private readonly sarosDlmmService = new SarosDlmmService();

  constructor() {
    super();
  }

  async getPool(poolAddress: string): Promise<UnifiedPool> {
    const dlmmPool = await this.sarosPoolService.getDlmmPool(poolAddress);
    return this.transformSarosPoolDetailToUnified(dlmmPool.data);
  }

  async getTrendingPools(
    params?: TrendingParams
  ): Promise<PaginatedTrendingPools> {
    const response = await this.sarosPoolService.getAllDlmmPools({
      page: params?.page || 1,
      size: TRENDING_CONSTANTS.PAGE_SIZE,
      orderBy:
        params?.sortBy === "apy" || params?.sortBy === "fee_tvl_ratio"
          ? "volume24h"
          : params?.sortBy === "tvl"
            ? "totalLiquidity"
            : "volume24h",
      order: "desc",
    });

    return {
      pools: response.data.data.map((pool) =>
        this.transformSarosPoolToUnified(pool)
      ),
      sortBy: params?.sortBy || "tvl",
      currentPage: response.data.currentPage,
      totalPages: response.data.total,
    };
  }

  async searchPools(query: string): Promise<UnifiedPool[]> {
    // TODO: Implement pool search functionality
    throw new Error("Method not implemented.");
  }

  async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
    const positions = await this.sarosDlmmService.getPositions(userAddress);

    const unifiedPositions: UnifiedPosition[] = [];

    for (const position of positions) {
      try {
        const unifiedPosition =
          await this.transformSarosPositionToUnified(position);
        unifiedPositions.push(unifiedPosition);
      } catch (error) {
        console.error(
          `Error transforming position for pool ${position.pair}:`,
          error
        );
      }
    }

    return unifiedPositions;
  }

  async getPosition(
    positionAddress: string,
    _context?: PositionContext
  ): Promise<UnifiedPosition> {
    // TODO: Implement single position retrieval
    throw new Error("Method not implemented.");
  }

  async createPosition(
    params: CreatePositionParams
  ): Promise<TransactionResult> {
    // TODO: Implement using existing sarosDlmmService.createPositionIx()
    throw new Error("Method not implemented.");
  }

  async createPositionIx(
    params: CreatePositionParams
  ): Promise<CreatePositionResult> {
    // TODO: Implement using existing sarosDlmmService.createPositionIx()
    throw new Error("Method not implemented.");
  }

  async closePosition(positionAddress: string): Promise<TransactionResult> {
    // TODO: Implement position closing logic
    throw new Error("Method not implemented.");
  }

  async claimFees(positionAddress: string): Promise<TransactionResult> {
    // TODO: Implement fee claiming logic
    throw new Error("Method not implemented.");
  }

  async rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult> {
    // TODO: Implement rebalancing logic
    throw new Error("Method not implemented.");
  }

  parsePoolUrl(url: string): UrlParseResult | null {
    const trimmed = url.trim();

    // Check DLMM pattern
    const dlmmMatch = trimmed.match(this.urlPatterns.dlmm);
    if (dlmmMatch) {
      return {
        dex: "saros",
        poolId: dlmmMatch[1],
        poolType: "DLMM",
      };
    }

    return null;
  }

  private transformSarosPoolToUnified(sarosPool: SarosDlmmPool): UnifiedPool {
    const mainPair = sarosPool.pairs[0];

    return {
      id:
        mainPair?.pair ||
        `${sarosPool.tokenX.mintAddress}-${sarosPool.tokenY.mintAddress}`,
      address: mainPair?.pair || "",
      name: `${sarosPool.tokenX.symbol}-${sarosPool.tokenY.symbol}`,
      dex: "saros" as PoolDex,
      type: "DLMM" as PoolType,
      tokenA: this.mapSarosTokenToToken(sarosPool.tokenX),
      tokenB: this.mapSarosTokenToToken(sarosPool.tokenY),
      // core metrics
      liquidity: sarosPool.totalLiquidity,
      tvl: sarosPool.totalLiquidity,
      apr: sarosPool.apr24h,
      apy: this.calculateApy(sarosPool.apr24h),
      currentPrice: mainPair
        ? this.calculatePrice(
            mainPair.reserveX,
            mainPair.reserveY,
            sarosPool.tokenX.decimals,
            sarosPool.tokenY.decimals
          )
        : 0,
      isVerified: true,

      volume24h: parseFloat(sarosPool.volume24h) || 0,
      fees24h: parseFloat(sarosPool.fees24h) || 0,
      feeTvlRatio24h: this.calculateFeeTvlRatio(
        sarosPool.fees24h,
        sarosPool.totalLiquidity
      ),
    };
  }

  private transformSarosPoolDetailToUnified(
    sarosPoolDetail: SarosDlmmPoolDetail
  ): UnifiedPool {
    return {
      id: sarosPoolDetail.pair,
      address: sarosPoolDetail.pair,
      name: `${sarosPoolDetail.tokenX.symbol.toUpperCase()}-${sarosPoolDetail.tokenY.symbol.toUpperCase()}`,
      dex: "saros" as PoolDex,
      type: "DLMM" as PoolType,
      tokenA: this.mapSarosTokenToToken(sarosPoolDetail.tokenX),
      tokenB: this.mapSarosTokenToToken(sarosPoolDetail.tokenY),
      liquidity: sarosPoolDetail.totalLiquidity,
      apr: sarosPoolDetail.apr24h,
      apy: this.calculateApy(sarosPoolDetail.apr24h),
      tvl: sarosPoolDetail.totalLiquidity,
      isVerified: true,
      currentPrice: this.calculatePrice(
        sarosPoolDetail.reserveX,
        sarosPoolDetail.reserveY,
        sarosPoolDetail.tokenX.decimals,
        sarosPoolDetail.tokenY.decimals
      ),
      volume24h: parseFloat(sarosPoolDetail.volume24h) || 0,
      fees24h: parseFloat(sarosPoolDetail.fees24h) || 0,
      feeTvlRatio24h: this.calculateFeeTvlRatio(
        sarosPoolDetail.fees24h,
        sarosPoolDetail.totalLiquidity
      ),
      volume: {
        hour1: 0,
        // hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPoolDetail.volume24h) || 0,
        // min30: 0,
      },
      fees: {
        hour1: 0,
        // hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPoolDetail.fees24h) || 0,
        // min30: 0,
      },
    };
  }

  private async transformSarosPositionToUnified(
    sarosPosition: SarosPoolPosition
  ): Promise<UnifiedPosition> {
    const dlmmPool = await this.sarosPoolService.getDlmmPool(
      sarosPosition.pair
    );
    const poolDetail = dlmmPool.data;

    const tokenA = this.mapSarosTokenToToken(poolDetail.tokenX);
    const tokenB = this.mapSarosTokenToToken(poolDetail.tokenY);

    const tokenAAmount = sarosPosition.reserveX.toString();
    const tokenBAmount = sarosPosition.reserveY.toString();

    const currentValueUsd = 0;
    const initialValueUsd = 0;

    const positionId = `${sarosPosition.pair}-${sarosPosition.postions.map((p) => p.position).join("-")}`;
    const positionAddress =
      sarosPosition.postions[0]?.position || sarosPosition.pair;

    return {
      id: positionId,
      address: positionAddress,
      poolAddress: sarosPosition.pair,
      dex: "saros" as DexType,
      type: "DLMM" as PoolType,

      // Token information
      tokenA,
      tokenB,

      // Position amounts
      tokenAAmount,
      tokenBAmount,

      // USD values (using defaults for now)
      currentValueUsd,
      initialValueUsd,

      // Fees and rewards (using defaults)
      unclaimedFeesUsd: 0,
      claimedFeesUsd: 0,
      unclaimedRewardsUsd: 0,
      claimedRewardsUsd: 0,

      // PnL (using defaults)
      pnlUsd: 0,
      pnlPercentage: 0,

      // Position status (using defaults)
      inRange: true, // TODO: Calculate based on current price and position range
      isActive: true,

      // Timestamps (using current time as default)
      createdAt: new Date(),
      updatedAt: new Date(),

      // Store Saros-specific data in metadata
      metadata: {
        sarosPositions: sarosPosition.postions,
        reserveX: sarosPosition.reserveX.toString(),
        reserveY: sarosPosition.reserveY.toString(),
      },
    };
  }

  private mapSarosTokenToToken(sarosToken: {
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  }): Token {
    return {
      address: sarosToken.mintAddress,
      symbol: sarosToken.symbol.toUpperCase(),
      name: sarosToken.name,
      decimals: sarosToken.decimals,
      logoUri: sarosToken.image,
    };
  }

  private calculateApy(apr: number): number {
    if (apr === 0) return 0;
    // APY = (1 + APR/365)^365 - 1
    return Math.pow(1 + apr / 100 / 365, 365) - 1;
  }

  private calculatePrice(
    reserveX: string,
    reserveY: string,
    decimalsX: number,
    decimalsY: number
  ): number {
    const reserveXNum = parseFloat(reserveX);
    const reserveYNum = parseFloat(reserveY);

    if (reserveXNum === 0 || reserveYNum === 0) return 0;

    // Adjust for decimals and calculate price (Y/X)
    const adjustedReserveX = reserveXNum / Math.pow(10, decimalsX);
    const adjustedReserveY = reserveYNum / Math.pow(10, decimalsY);

    return adjustedReserveY / adjustedReserveX;
  }

  private calculateFeeTvlRatio(
    fees24h: string,
    totalLiquidity: string
  ): number {
    const fees = parseFloat(fees24h) || 0;
    const tvl = parseFloat(totalLiquidity) || 0;

    if (tvl === 0) return 0;
    return fees / tvl;
  }
}
