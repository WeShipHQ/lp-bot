export interface DlmmDetail {
  liquidity?: number;
  apy?: number;
  fees_24h?: number;
  fee_tvl_ratio?: {
    hour_24?: number;
    hour_12?: number;
  };
  volume?: {
    min_30?: number;
    hour_1?: number;
    hour_4?: number;
    hour_24?: number;
  };
  mint_x?: string;
  mint_y?: string;
}

export interface DammV1Detail {
  pool_tvl?: number;
  fee_volume?: number;
  trading_volume?: number;
  weekly_trade_apy?: number;
  trade_apy?: number;
  pool_token_mints?: string[];
}

export interface DammV2Detail {
  tvl?: number;
  fee24h?: number;
  fee_tvl_ratio?: number;
  volume24h?: number;
  apr?: number;
  token_a_mint?: string;
  token_b_mint?: string;
}
