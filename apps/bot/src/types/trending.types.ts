import { MeteoraDammV1PoolResponse } from "./meteora.types";

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
}

export interface PoolTrendingItem {
  poolAddress: string;
  poolName: string;
  poolType: "DLMM" | "DAMM v1" | "DAMM v2";
  tokenPair: string;
  apy: number;
  fee24h: number;
  tvl: number;
  feeTvlRatio?: number;
  volume24h?: number;
  isVerified: boolean;
}

export interface TokenBucket {
  mint: string;
  symbol: string;
  totalVol12h: number;
  pools: PairItem[];
}

export interface TrendingPageState {
  items: TrendingItem[];
  poolItems?: PoolTrendingItem[];
  page: number;
  apiPage?: number;
  totalPages?: number;
  messageId?: number;
  displayMode?: "tokens" | "pools";
  poolSource?: "dlmm" | "dammv1" | "dammv2";
  sortBy?: "apy" | "tvl" | "volume24h" | "fee_tvl_ratio";
}
export interface DammV1SearchResponse {
  status?: number;
  total?: number;
  pages?: number;
  current_page?: number;
  data: MeteoraDammV1PoolResponse[];
}
export interface DammV2PoolResponse {
  data: never[];
  pool_address: string;
  pool_name: string;
  creator: string;
  token_a_mint: string;
  token_b_mint: string;
  token_a_vault: string;
  token_b_vault: string;
  token_a_symbol: string;
  token_b_symbol: string;
  alpha_vault: string;
  sqrt_min_price: string;
  sqrt_max_price: string;
  min_price: string;
  max_price: string;
  liquidity: string;
  permanent_lock_liquidity: string;
  sqrt_price: number;
  token_a_amount: number;
  token_b_amount: number;
  token_a_amount_usd: number;
  token_b_amount_usd: number;
  pool_price: number;
  virtual_price: number;
  pool_type: number;
  created_at_slot: number;
  created_at_slot_timestamp: number;
  updated_at: number;
  tvl: number;
  apr: number;
  fee_tvl_ratio: number;
  fee24h: number;
  volume24h: number;
  base_fee: number;
  dynamic_fee: number;
  fee_scheduler_mode: number;
  collect_fee_mode: number;
  launchpad: any;
  tokens_verified: boolean;
  has_farm: boolean;
  farm_active: boolean;
}
