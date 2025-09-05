import type { Token } from "./token.types";

export type PoolType = "DLMM" | "DAMM" | "CLMM" | "AMM";
export type PoolDex = "meteora" | "orca" | "raydium";

export interface Pool {
  id: string;
  address: string;
  name: string;
  dex: PoolDex;
  type: PoolType;
  tokenA: Token;
  tokenB: Token;
  liquidity: string;
  apr: number;
  apy: number;
  tvl: string;
  isVerified: boolean;
  currentPrice: number;
  //   volume24h: string;
  volume: {
    hour1: number;
    hour12: number;
    hour2: number;
    hour24: number;
    hour4: number;
    min30: number;
  };
  //   fees24h: string;
  fees: {
    hour1: number;
    hour12: number;
    hour2: number;
    hour24: number;
    hour4: number;
    min30: number;
  };
  // for meteora
  feeTvlRatio: {
    hour: number;
    hour12: number;
    hour2: number;
    hour24: number;
    hour4: number;
    min30: number;
  };
  meteora: {
    hide: boolean;
    isBlacklisted: boolean;
    baseFeePercentage: string;
    binStep: number;
    cumulativeFeeVolume: string;
    cumulativeTradeVolume: string;
    farmApr: number;
    farmApy: number;
    launchpad: string;
    maxFeePercentage: string;
    protocolFeePercentage: string;
    reserveX: string;
    reserveXAmount: number;
    reserveY: string;
    reserveYAmount: number;
    rewardMintX: string;
    rewardMintY: string;
    tags: Array<string>;
    todayFees: number;
  };
}
