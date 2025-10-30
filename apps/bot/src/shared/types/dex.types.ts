export type DexType = 'meteora' | 'saros' | 'orca' | 'raydium';
export type PoolType = 'DLMM' | 'DAMM' | 'CLMM' | 'AMM';
export type StrategyType = 'DLMM' | 'DAMM' | 'CONCENTRATED';

export type TrendingPoolsSortCriteria = 'apy' | 'tvl' | 'volume24h' | 'fee_tvl_ratio';

export interface TrendingParams {
  page?: number;
  limit?: number;
  sortBy?: TrendingPoolsSortCriteria;
  sortOrder?: 'asc' | 'desc';
  minTvl?: number;
  verified?: boolean;
}

export interface UrlParseResult {
  dex: DexType;
  poolId: string;
  poolType?: PoolType;
}
