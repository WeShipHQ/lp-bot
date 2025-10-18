import { DexType } from './dex.types';
import { UnifiedPosition } from './position.types';

export interface DexBreakdown {
  positions: number;
  valueUsd: number;
  pnlUsd: number;
}

export interface UnifiedPortfolio {
  userAddress: string;
  positions: UnifiedPosition[];
  totalValueUsd: number;
  totalPnlUsd: number;
  totalFeesUsd: number;
  totalRewardsUsd?: number;
  dexBreakdown: Record<DexType, DexBreakdown>;
}

export interface PortfolioMetrics {
  totalPositions: number;
  activePositions: number;
  closedPositions: number;
  totalValueUsd: number;
  totalPnlUsd: number;
  totalPnlPercentage: number;
  totalFeesEarned: number;
  averagePositionValue: number;
  bestPerformingPosition?: UnifiedPosition;
  worstPerformingPosition?: UnifiedPosition;
}
