import type { Pool, PoolDex, PoolType } from "@/types/pool.types";
import type { Token } from "@/types/token.types";
import type { SarosDlmmPool, SarosDlmmPoolDetail } from "./types";

export class SarosAdapter {
  static dlmmPoolToPool(sarosPool: SarosDlmmPool): Pool {
    // Use the first pair for main pool data, or create aggregated data
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
      liquidity: sarosPool.totalLiquidity,
      apr: sarosPool.apr24h,
      apy: this.calculateApy(sarosPool.apr24h),
      tvl: sarosPool.totalLiquidity,
      isVerified: true,
      currentPrice: mainPair
        ? this.calculatePrice(
            mainPair.reserveX,
            mainPair.reserveY,
            sarosPool.tokenX.decimals,
            sarosPool.tokenY.decimals
          )
        : 0,
      volume: {
        hour1: 0, // Not available in Saros data
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPool.volume24h) || 0,
        min30: 0,
      },
      fees: {
        hour1: 0, // Not available in Saros data
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPool.fees24h) || 0,
        min30: 0,
      },
      feeTvlRatio: {
        hour: 0, // Not available in Saros data
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: this.calculateFeeTvlRatio(
          sarosPool.fees24h,
          sarosPool.totalLiquidity
        ),
        min30: 0,
      },
    };
  }

  static dlmmPoolDetailToPool(sarosPoolDetail: SarosDlmmPoolDetail): Pool {
    return {
      id: sarosPoolDetail.pair,
      address: sarosPoolDetail.pair,
      name: `${sarosPoolDetail.tokenX.symbol}-${sarosPoolDetail.tokenY.symbol}`,
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
      volume: {
        hour1: 0,
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPoolDetail.volume24h) || 0,
        min30: 0,
      },
      fees: {
        hour1: 0,
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: parseFloat(sarosPoolDetail.fees24h) || 0,
        min30: 0,
      },
      feeTvlRatio: {
        hour: 0,
        hour2: 0,
        hour4: 0,
        hour12: 0,
        hour24: this.calculateFeeTvlRatio(
          sarosPoolDetail.fees24h,
          sarosPoolDetail.totalLiquidity
        ),
        min30: 0,
      },
      meteora: {
        hide: false,
        isBlacklisted: false,
        baseFeePercentage: sarosPoolDetail.baseFactor.toString(),
        binStep: sarosPoolDetail.binStep,
        cumulativeFeeVolume: sarosPoolDetail.fees24h,
        cumulativeTradeVolume: sarosPoolDetail.volume24h,
        farmApr: 0, // Not available in pool detail
        farmApy: 0,
        launchpad: "",
        maxFeePercentage: "0",
        protocolFeePercentage: "0",
        reserveX: sarosPoolDetail.reserveX,
        reserveXAmount: parseFloat(sarosPoolDetail.reserveX),
        reserveY: sarosPoolDetail.reserveY,
        reserveYAmount: parseFloat(sarosPoolDetail.reserveY),
        rewardMintX: "",
        rewardMintY: "",
        tags: [],
        todayFees: parseFloat(sarosPoolDetail.fees24h) || 0,
      },
    };
  }

  static dlmmPoolsToPoolArray(sarosPools: SarosDlmmPool[]): Pool[] {
    return sarosPools.map((pool) => this.dlmmPoolToPool(pool));
  }

  private static mapSarosTokenToToken(sarosToken: {
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  }): Token {
    return {
      address: sarosToken.mintAddress,
      symbol: sarosToken.symbol,
      name: sarosToken.name,
      decimals: sarosToken.decimals,
      logoUri: sarosToken.image,
    };
  }

  private static calculateApy(apr: number): number {
    if (apr === 0) return 0;
    // APY = (1 + APR/365)^365 - 1
    return Math.pow(1 + apr / 100 / 365, 365) - 1;
  }

  private static calculatePrice(
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

  private static calculateFeeTvlRatio(
    fees24h: string,
    totalLiquidity: string
  ): number {
    const fees = parseFloat(fees24h) || 0;
    const tvl = parseFloat(totalLiquidity) || 0;

    if (tvl === 0) return 0;
    return fees / tvl;
  }
}
