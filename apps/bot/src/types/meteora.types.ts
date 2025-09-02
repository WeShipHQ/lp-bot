import type {
  LbPosition,
  TInitializePositionAndAddLiquidityParamsByStrategy,
  StrategyType,
} from "@meteora-ag/dlmm";
import type { PublicKey } from "@solana/web3.js";

export type MeteoraStrategyTypeKey = keyof typeof StrategyType;
export type MeteoraPoolType = "damm_v1" | "damm_v2" | "dlmm";
export type MeteoraCreatePositionStrategy = "spot" | "curve" | "single-sided";

export interface CreateMeteoraPositionParams
  extends TInitializePositionAndAddLiquidityParamsByStrategy {}

export interface CloseMeteoraPositionParams {
  owner: PublicKey;
  position: LbPosition;
}

// pools
export interface MeteoraDlmmPool {
  address: string;
  apr: number;
  apy: number;
  base_fee_percentage: string;
  bin_step: number;
  cumulative_fee_volume: string;
  cumulative_trade_volume: string;
  current_price: number;
  farm_apr: number;
  farm_apy: number;
  fee_tvl_ratio: {
    hour_1: number;
    hour_12: number;
    hour_2: number;
    hour_24: number;
    hour_4: number;
    min_30: number;
  };
  fees: {
    hour_1: number;
    hour_12: number;
    hour_2: number;
    hour_24: number;
    hour_4: number;
    min_30: number;
  };
  fees_24h: number;
  hide: boolean;
  is_blacklisted: boolean;
  is_verified: boolean;
  launchpad: string;
  liquidity: string;
  max_fee_percentage: string;
  mint_x: string;
  mint_y: string;
  name: string;
  protocol_fee_percentage: string;
  reserve_x: string;
  reserve_x_amount: number;
  reserve_y: string;
  reserve_y_amount: number;
  reward_mint_x: string;
  reward_mint_y: string;
  tags: Array<string>;
  today_fees: number;
  trade_volume_24h: number;
  volume: {
    hour_1: number;
    hour_12: number;
    hour_2: number;
    hour_24: number;
    hour_4: number;
    min_30: number;
  };
}

export interface MeteoraDlmmPoolResponse extends MeteoraDlmmPool {}

export interface MeteoraDammV1PoolResponse {
  fee_volume: number;
  trading_volume: number;
  accumulated_fee_volume: number;
  accumulated_trading_volume: number;
  accumulated_yield_volume: number;
  yield_volume: string;
  created_at: number;
  daily_base_apy: string;
  farm_expire: boolean;
  farm_new: boolean;
  farm_order: number;
  farm_reward_duration_end: number;
  farm_tvl: string;
  farming_apy: string;
  farming_pool: string;
  is_forex: boolean;
  is_lst: boolean;
  is_monitoring: boolean;
  lp_decimal: number;
  lp_mint: string;
  permissioned: boolean;
  pool_address: string;
  pool_lp_price_in_usd: string;
  pool_name: string;
  pool_order: number;
  pool_token_amounts: string[];
  pool_token_mints: string[];
  pool_token_usd_amounts: string[];
  pool_tvl: string;
  pool_version: number;
  total_fee_pct: string;
  trade_apy: string;
  unknown: boolean;
  weekly_base_apy: string;
  weekly_trade_apy: string;
}

export interface MeteoraDammV2PoolResponse {
  status: number;
  data: {
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
  };
}

export interface MeteoraPoolData {
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
  launchpad: string | null;
  tokens_verified: boolean;
  has_farm: boolean;
  farm_active: boolean;
}

// pool type for display
export interface MeteoraDlmmPoolDetail extends MeteoraDlmmPool {
  token_x: {
    address: string;
    name: string;
    symbol: string;
    icon?: string;
    decimals: number;
  };
  token_y: {
    address: string;
    name: string;
    symbol: string;
    icon?: string;
    decimals: number;
  };
}

// position
export interface MeteoraDlmmPosition {
  address: string;
  pair_address: string;
  owner: string;
  total_fee_x_claimed: number;
  total_fee_y_claimed: number;
  total_reward_x_claimed: number;
  total_reward_y_claimed: number;
  total_fee_usd_claimed: number;
  total_reward_usd_claimed: number;
  fee_apy_24h: number;
  fee_apr_24h: number;
  daily_fee_yield: number;
}

export interface MeteoraDlmmPoolsPaginationResponse {
  pairs: Array<MeteoraDlmmPool>;
  total: number;
}

export interface DlmmPoolsPaginationParams {
  page?: number;
  limit?: number;
  skip_size?: number;
  pools_to_top?: string[];
  sort_key?:
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
  order_by?: "asc" | "desc";
  search_term?: string;
  include_unknown?: boolean;
  hide_low_tvl?: number;
  hide_low_apr?: boolean;
  include_token_mints?: string[];
  include_pool_token_pairs?: string[];
  tags?: string[];
  launchpad?: string[];
}
