import { MeteoraPoolData } from "@/types/meteora.types";
import { DammV2PoolResponse } from "@/types/trending.types";

export interface HotPoolItem {
  address: string;
  name: string;
  type: "DLMM" | "DAMM v1" | "DAMM v2";
  tokenASymbol: string;
  tokenBSymbol: string;
  apy: number;
  fee24h: number;
  tvl: number;
  feeTvlRatio?: number;
  isVerified: boolean;
  poolData: MeteoraPoolData;
}

export type PoolSortCriteria = 
  | "tvl" 
  | "volume" 
  | "feetvlratio" 
  | "lm" 
  | "feetvlratio30m" 
  | "feetvlratio1h" 
  | "feetvlratio2h" 
  | "feetvlratio4h" 
  | "feetvlratio12h" 
  | "volume30m" 
  | "volume1h" 
  | "volume2h" 
  | "volume4h" 
  | "volume12h";

export type PoolSource = "dlmm" | "dammv1" | "dammv2";

export interface HotPoolFilters {
  sortBy: PoolSortCriteria;
  minTvl: number;
  onlyVerified: boolean;
  includeUnknown: boolean;
}

export type { DammV2PoolResponse, MeteoraPoolData };
