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
  metadata: Record<string, any>; // DEX-specific data
}

export interface Position {
  id: string;
  poolId: string;
  dex: string;
  userAddress: string;
  liquidity: string;
  tokenAAmount: string;
  tokenBAmount: string;
  feesEarned: string;
  pnl: {
    absolute: string;
    percentage: number;
  };
  status: "active" | "closed" | "rebalancing";
  createdAt: Date;
  updatedAt: Date;
}
