export interface PairItem {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  liquidity?: string;
  trade_volume_24h?: number;
  fees_24h?: number;
  fee_tvl_ratio?: Record<string, number>;
  apr?: number;
  apy?: number;
  lm?: number;
  reserve_x_amount?: number;
  reserve_y_amount?: number;
  is_verified?: boolean;
  volume?: {
    hour_24?: number;
    hour_12?: number;
    hour_4?: number;
    hour_2?: number;
    hour_1?: number;
    min_30?: number;
  };
}

export interface MeteoraApiResponse {
  pairs: PairItem[];
  total: number;
}

export interface MeteoraGroupsResponse {
  groups: Array<{
    name: string;
    pairs: PairItem[];
  }>;
  total: number;
}

export interface DexscreenerToken {
  pairs?: Array<{
    baseToken?: { address?: string; symbol?: string };
    quoteToken?: { address?: string; symbol?: string };
    marketCap?: number | null;
    fdv?: number | null;
    volume?: { h24?: number };
    url?: string;
  }>;
}

export interface TrendingItem {
  mint: string;
  symbol: string;
  totalVol12h: number;
  bestPool?: PairItem;
  mcap?: number | null;
  vol24h_ds?: number | null;
  dexs_url?: string;
}

export interface TokenBucket {
  mint: string;
  symbol: string;
  totalVol12h: number;
  pools: PairItem[];
}

export interface TrendingPageState {
  items: TrendingItem[];
  page: number;
  apiPage?: number;
  messageId?: number;
}
