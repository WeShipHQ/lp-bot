export interface DlmmClaimFee {
  onchain_timestamp: number;
  pair_address: string;
  position_address: string;
  token_x_amount: number;
  token_x_usd_amount: number;
  token_y_amount: number;
  token_y_usd_amount: number;
  tx_id: string;
}

export interface DlmmDepositWithdraw {
  active_bin_id: number;
  onchain_timestamp: number;
  pair_address: string;
  position_address: string;
  price: number;
  token_x_amount: number;
  token_x_usd_amount: number;
  token_y_amount: number;
  token_y_usd_amount: number;
  tx_id: string;
}

export interface DlmmClaimReward {
  onchain_timestamp: number;
  pair_address: string;
  position_address: string;
  reward_mint_address: string;
  token_amount: number;
  token_usd_amount: number;
  tx_id: string;
}

export type PortfolioPosition = {
  position_address: string;
  program_type: "DLMM";
  pool_address: string;

  current_x_amount?: number;
  current_y_amount?: number;

  token_x_info: {
    mint: string;
    symbol: string;
    decimals: number;
    image?: string;
  };
  token_y_info: {
    mint: string;
    symbol: string;
    decimals: number;
    image?: string;
  };

  unclaimed_fees_x?: number;
  unclaimed_fees_y?: number;

  claimed_fees_x?: number;
  claimed_fees_y?: number;

  current_value_usd: number;

  total_deposits_usd: number;
  total_withdrawals_usd: number;
  total_claimed_fees_usd: number; // gồm cả rewards
  total_unclaimed_fees_usd: number;

  pnl_usd: number;
  pnl_pct?: number;

  pool_fee_tvl_24h?: number;
  auto_rebalancing_enabled?: boolean;

  in_range: boolean;
  created_at: string;

  is_tracked_in_db?: boolean;
};

export type PortfolioTotals = {
  total_positions: number;
  total_current_value_usd: number;
  total_unclaimed_fees_usd: number;
  total_claimed_fees_usd: number;
  total_deposits_usd: number;
  total_withdrawals_usd: number;
  total_pnl_usd: number;
  total_net_deposited_usd: number;
};

export type PortfolioData = {
  walletAddress: string;
  positions: PortfolioPosition[];
  totals: PortfolioTotals;
};

export type PortfolioResult =
  | { success: true; data: PortfolioData; message?: string }
  | { success: false; message: string };
