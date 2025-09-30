export type SarosBaseResponse<T> = {
  status: number;
  success: boolean;
  data: T;
};

export type SarosBaseListResponse<T> = {
  status: number;
  success: boolean;
  data: {
    data: Array<T>;
    currentPage: number;
    total: number;
  };
};

export interface SarosDlmmPoolsFilterParams {
  page?: number;
  size?: number;
  orderBy?: "volume24h" | "totalLiquidity";
  order?: "asc" | "desc";
}

export type SarosDlmmPool = {
  tokenX: {
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  };
  tokenY: {
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  };
  totalLiquidity: string;
  volume24h: string;
  fees24h: string;
  apr24h: number;
  pairs: Array<{
    pair: string;
    binStep: number;
    activeBin: number;
    tokenX: {
      address: string;
      mintAddress: string;
      name: string;
      symbol: string;
      decimals: number;
      image: string;
    };
    tokenY: {
      address: string;
      mintAddress: string;
      name: string;
      symbol: string;
      decimals: number;
      image: string;
    };
    reserveX: string;
    reserveY: string;
    baseFactor: number;
    totalLiquidity: number;
    volume24h: number;
    fees24h: number;
    feesApr: number;
    rewardsApr: number;
    apr24h: number;
  }>;
};

export type SarosDlmmPoolDetail = {
  pair: string;
  config: string;
  hook: string;
  quoteAssetBadge: string;
  binStep: number;
  binStepConfig: string;
  activeBin: number;
  tokenX: {
    address: string;
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  };
  tokenY: {
    address: string;
    mintAddress: string;
    name: string;
    symbol: string;
    decimals: number;
    image: string;
  };
  reserveX: string;
  reserveY: string;
  totalLiquidity: string;
  liquidityDepthTokenX: string;
  liquidityDepthTokenY: string;
  protocolFeesX: string;
  protocolFeesY: string;
  baseFactor: number;
  volume24h: string;
  fees24h: string;
  apr24h: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
