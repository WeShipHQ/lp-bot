import { DexType, PoolType, TrendingPoolsSortCriteria } from './dex.types';
import { TokenInfo } from './position.types';

export interface UnifiedPool {
  id: string;
  address: string;
  name: string;
  dex: DexType;
  type: PoolType;
  tokenA: TokenInfo;
  tokenB: TokenInfo;

  liquidity: string;
  tvl: string;
  apr: number;
  apy: number;
  currentPrice: number;
  isVerified: boolean;

  volume24h: number;
  fees24h: number;
  feeTvlRatio24h: number;

  volume?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };

  fees?: {
    hour1?: number;
    hour4?: number;
    hour12?: number;
    hour24?: number;
  };

  metadata?: Record<string, any>;
}

export interface PaginatedTrendingPools {
  pools: UnifiedPool[];
  currentPage: number;
  totalPages: number;
  sortBy: TrendingPoolsSortCriteria;
}
