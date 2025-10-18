import { DexType, PoolType } from './dex.types';

export type PositionStatus = 'ACTIVE' | 'CLOSED' | 'REBALANCING';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export interface UnifiedPosition {
  id: string;
  address: string;
  poolAddress: string;
  dex: DexType;
  type: PoolType;

  tokenA: TokenInfo;
  tokenB: TokenInfo;

  tokenAAmount: string;
  tokenBAmount: string;

  currentValueUsd: number;
  initialValueUsd: number;

  unclaimedFeesUsd: number;
  claimedFeesUsd: number;
  unclaimedRewardsUsd?: number;
  claimedRewardsUsd?: number;

  pnlUsd: number;
  pnlPercentage: number;

  inRange: boolean;
  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;

  metadata?: Record<string, any>;
}

export interface CreatePositionParams {
  poolAddress: string;
  userAddress: string;
  tokenAAmount: string;
  tokenBAmount: string;
  strategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}

export interface RebalanceParams {
  newStrategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}
