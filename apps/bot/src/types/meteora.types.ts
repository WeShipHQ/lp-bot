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