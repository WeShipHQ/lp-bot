import type { PoolDex, PoolType } from "@/types/pool.types";
import type { Token } from "@/types/token.types";
import type { SarosDlmmPool, SarosDlmmPoolDetail } from "./types";
import {
  BaseDexAdapter,
  CreatePositionParams,
  DexType,
  RebalanceParams,
  TransactionResult,
  TrendingParams,
  PaginatedTrendingPools,
  UnifiedPool,
  UnifiedPosition,
  UrlParseResult,
} from "@/v2";
import { SarosPoolService } from "./pool.service";
import { TRENDING_CONSTANTS } from "@/bot/config/constants";

export class SarosAdapter extends BaseDexAdapter {
  readonly dexType: DexType = "saros";
  readonly name: string = "Saros";

  // URL patterns for Saros
  private readonly urlPatterns = {
    dlmm: /^https:\/\/(?:www\.)?saros\.xyz\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
  };

  private readonly sarosPoolService = new SarosPoolService();

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
    // TODO: Implement using existing Saros position service
    throw new Error("Method not implemented.");
  }

  async getPosition(positionAddress: string): Promise<UnifiedPosition> {
    // TODO: Implement single position retrieval
    throw new Error("Method not implemented.");
  }

  async createPosition(
    params: CreatePositionParams
  ): Promise<TransactionResult> {
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

  private transformSarosPositionToUnified(sarosPosition: any): UnifiedPosition {
    // TODO: Transform Saros position data to unified format
    throw new Error("Method not implemented.");
  }

  // legacy functions
  // static dlmmPoolToPool(sarosPool: SarosDlmmPool): Pool {
  //   // Use the first pair for main pool data, or create aggregated data
  //   const mainPair = sarosPool.pairs[0];

  //   return {
  //     id:
  //       mainPair?.pair ||
  //       `${sarosPool.tokenX.mintAddress}-${sarosPool.tokenY.mintAddress}`,
  //     address: mainPair?.pair || "",
  //     name: `${sarosPool.tokenX.symbol}-${sarosPool.tokenY.symbol}`,
  //     dex: "saros" as PoolDex,
  //     type: "DLMM" as PoolType,
  //     tokenA: this.mapSarosTokenToToken(sarosPool.tokenX),
  //     tokenB: this.mapSarosTokenToToken(sarosPool.tokenY),
  //     liquidity: sarosPool.totalLiquidity,
  //     apr: sarosPool.apr24h,
  //     apy: this.calculateApy(sarosPool.apr24h),
  //     tvl: sarosPool.totalLiquidity,
  //     isVerified: true,
  //     currentPrice: mainPair
  //       ? this.calculatePrice(
  //           mainPair.reserveX,
  //           mainPair.reserveY,
  //           sarosPool.tokenX.decimals,
  //           sarosPool.tokenY.decimals
  //         )
  //       : 0,
  //     volume: {
  //       hour1: 0, // Not available in Saros data
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: parseFloat(sarosPool.volume24h) || 0,
  //       min30: 0,
  //     },
  //     fees: {
  //       hour1: 0, // Not available in Saros data
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: parseFloat(sarosPool.fees24h) || 0,
  //       min30: 0,
  //     },
  //     feeTvlRatio: {
  //       hour: 0, // Not available in Saros data
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: this.calculateFeeTvlRatio(
  //         sarosPool.fees24h,
  //         sarosPool.totalLiquidity
  //       ),
  //       min30: 0,
  //     },
  //   };
  // }

  // static dlmmPoolDetailToPool(sarosPoolDetail: SarosDlmmPoolDetail): Pool {
  //   return {
  //     id: sarosPoolDetail.pair,
  //     address: sarosPoolDetail.pair,
  //     name: `${sarosPoolDetail.tokenX.symbol.toUpperCase()}-${sarosPoolDetail.tokenY.symbol.toUpperCase()}`,
  //     dex: "saros" as PoolDex,
  //     type: "DLMM" as PoolType,
  //     tokenA: this.mapSarosTokenToToken(sarosPoolDetail.tokenX),
  //     tokenB: this.mapSarosTokenToToken(sarosPoolDetail.tokenY),
  //     liquidity: sarosPoolDetail.totalLiquidity,
  //     apr: sarosPoolDetail.apr24h,
  //     apy: this.calculateApy(sarosPoolDetail.apr24h),
  //     tvl: sarosPoolDetail.totalLiquidity,
  //     isVerified: true,
  //     currentPrice: this.calculatePrice(
  //       sarosPoolDetail.reserveX,
  //       sarosPoolDetail.reserveY,
  //       sarosPoolDetail.tokenX.decimals,
  //       sarosPoolDetail.tokenY.decimals
  //     ),
  //     volume: {
  //       hour1: 0,
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: parseFloat(sarosPoolDetail.volume24h) || 0,
  //       min30: 0,
  //     },
  //     fees: {
  //       hour1: 0,
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: parseFloat(sarosPoolDetail.fees24h) || 0,
  //       min30: 0,
  //     },
  //     feeTvlRatio: {
  //       hour: 0,
  //       hour2: 0,
  //       hour4: 0,
  //       hour12: 0,
  //       hour24: this.calculateFeeTvlRatio(
  //         sarosPoolDetail.fees24h,
  //         sarosPoolDetail.totalLiquidity
  //       ),
  //       min30: 0,
  //     },
  //     meteora: {
  //       hide: false,
  //       isBlacklisted: false,
  //       baseFeePercentage: sarosPoolDetail.baseFactor.toString(),
  //       binStep: sarosPoolDetail.binStep,
  //       cumulativeFeeVolume: sarosPoolDetail.fees24h,
  //       cumulativeTradeVolume: sarosPoolDetail.volume24h,
  //       farmApr: 0, // Not available in pool detail
  //       farmApy: 0,
  //       launchpad: "",
  //       maxFeePercentage: "0",
  //       protocolFeePercentage: "0",
  //       reserveX: sarosPoolDetail.reserveX,
  //       reserveXAmount: parseFloat(sarosPoolDetail.reserveX),
  //       reserveY: sarosPoolDetail.reserveY,
  //       reserveYAmount: parseFloat(sarosPoolDetail.reserveY),
  //       rewardMintX: "",
  //       rewardMintY: "",
  //       tags: [],
  //       todayFees: parseFloat(sarosPoolDetail.fees24h) || 0,
  //     },
  //   };
  // }

  // static dlmmPoolsToPoolArray(sarosPools: SarosDlmmPool[]): Pool[] {
  //   return sarosPools.map((pool) => this.dlmmPoolToPool(pool));
  // }

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
