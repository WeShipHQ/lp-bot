import type {
  LbPosition,
  TInitializePositionAndAddLiquidityParamsByStrategy,
} from "@meteora-ag/dlmm";
import type { PublicKey } from "@solana/web3.js";

export interface CreateMeteoraPositionParams
  extends TInitializePositionAndAddLiquidityParamsByStrategy {}

export interface CloseMeteoraPositionParams {
  owner: PublicKey;
  position: LbPosition;
}

// pools
export interface MeteoraDlmmPoolResponse {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
  is_blacklisted: boolean;
  fees: {
    min_30: number;
    hour_1: number;
    hour_2: number;
    hour_4: number;
    hour_12: number;
    hour_24: number;
  };
  fee_tvl_ratio: {
    min_30: number;
    hour_1: number;
    hour_2: number;
    hour_4: number;
    hour_12: number;
    hour_24: number;
  };
  volume: {
    min_30: number;
    hour_1: number;
    hour_2: number;
    hour_4: number;
    hour_12: number;
    hour_24: number;
  };
  tags: string[];
  launchpad: any;
  is_verified: boolean;
}

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
