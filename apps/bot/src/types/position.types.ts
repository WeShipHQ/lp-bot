import { Token } from "./token.types";

export type PositionStatus = "active" | "closed" | "rebalancing";

export interface Position {
  id: string;
  poolId: string;
  dex: string;
  userAddress: string;
  liquidity: string;
  tokenX: Token;
  tokenY: Token;
  feesEarned: string;
  pnl: {
    absolute: string;
    percentage: number;
  };
  status: PositionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DisplayPosition {
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

export interface PositionPnlResult {
  pnlUsd: number;
  pnlPercentage: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercentage: number;
}
