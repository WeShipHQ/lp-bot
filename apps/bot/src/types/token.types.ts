import { MeteoraPoolData } from "./meteora.types";

// Jupiter API Types
export interface JupiterTokenStats {
  priceChange: number;
  liquidityChange: number;
  volumeChange: number;
  buyVolume: number;
  sellVolume: number;
  buyOrganicVolume: number;
  sellOrganicVolume: number;
  numBuys: number;
  numSells: number;
  numTraders: number;
  numOrganicBuyers: number;
  numNetBuyers: number;
}

export interface JupiterTokenAudit {
  mintAuthorityDisabled: boolean;
  freezeAuthorityDisabled: boolean;
  topHoldersPercentage: number;
}

export interface JupiterTokenFirstPool {
  id: string;
  createdAt: string;
}

export interface JupiterToken {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  decimals: number;
  circSupply: number;
  totalSupply: number;
  tokenProgram: string;
  firstPool: JupiterTokenFirstPool;
  holderCount: number;
  audit: JupiterTokenAudit;
  organicScore: number;
  organicScoreLabel: string;
  isVerified: boolean;
  cexes: Array<string>;
  tags: Array<string>;
  fdv: number;
  mcap: number;
  usdPrice: number;
  priceBlockId: number;
  liquidity: number;
  stats5m: JupiterTokenStats;
  stats1h: JupiterTokenStats;
  stats6h: JupiterTokenStats;
  stats24h: JupiterTokenStats;
  ctLikes: number;
  smartCtLikes: number;
  updatedAt: string;
}

export type JupiterTokenSearchResponse = Array<JupiterToken>;

// Meteora Pool Types
// export interface MeteoraPoolData {
//   pool_address: string;
//   pool_name: string;
//   creator: string;
//   token_a_mint: string;
//   token_b_mint: string;
//   token_a_vault: string;
//   token_b_vault: string;
//   token_a_symbol: string;
//   token_b_symbol: string;
//   alpha_vault: string;
//   sqrt_min_price: string;
//   sqrt_max_price: string;
//   min_price: string;
//   max_price: string;
//   liquidity: string;
//   permanent_lock_liquidity: string;
//   sqrt_price: number;
//   token_a_amount: number;
//   token_b_amount: number;
//   token_a_amount_usd: number;
//   token_b_amount_usd: number;
//   pool_price: number;
//   virtual_price: number;
//   pool_type: number;
//   created_at_slot: number;
//   created_at_slot_timestamp: number;
//   updated_at: number;
//   tvl: number;
//   apr: number;
//   fee_tvl_ratio: number;
//   fee24h: number;
//   volume24h: number;
//   base_fee: number;
//   dynamic_fee: number;
//   fee_scheduler_mode: number;
//   collect_fee_mode: number;
//   launchpad: string | null;
//   tokens_verified: boolean;
//   has_farm: boolean;
//   farm_active: boolean;
// }

// export interface MeteoraPoolResponse {
//   status: number;
//   data: MeteoraPoolData;
// }

// Unified Token Info
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  icon?: string;
  decimals: number;
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  isVerified: boolean;
  source: "jupiter" | "meteora";
}

export interface TokenDisplayData {
  token: TokenInfo;
  poolInfo?: MeteoraPoolData;
  error?: string;
}

// Updated Input Detection Types
export type TokenInputType =
  | "address"
  | "meteora_damm_v1"
  | "meteora_damm_v2"
  | "meteora_dlmm"
  | "start_param";

export interface TokenInputDetection {
  type: TokenInputType;
  value: string; // token address or pool id
  originalInput: string;
}
