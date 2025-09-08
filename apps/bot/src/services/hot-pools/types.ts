import {
  MeteoraDlmmPoolResponse as DlmmPoolResponse,
  MeteoraDammV1PoolResponse as DammV1PoolResponse,
  MeteoraPoolData,
} from "@/types/meteora.types";
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

export type PoolSortCriteria = "apy" | "fee24h" | "fee_tvl_ratio";
export type PoolSource = "dlmm" | "dammv1" | "dammv2";

export interface HotPoolFilters {
  sortBy: PoolSortCriteria;
  minTvl: number;
  onlyVerified: boolean;
  includeUnknown: boolean;
}

export type {
  DlmmPoolResponse,
  DammV1PoolResponse,
  DammV2PoolResponse,
  MeteoraPoolData,
};
