import { Portfolio } from '@/domain/portfolio/portfolio.entity';

export interface PortfolioMetrics {
  totalValueUsd: number;
  totalPnLUsd: number;
  totalPnLPercentage: number;
  totalFeesUsd: number;
  activePositions: number;
  totalPositions: number;
  dexBreakdown: Array<{
    dex: string;
    positions: number;
    valueUsd: number;
    pnlUsd: number;
  }>;
}

export class CalculateMetricsUseCase {
  execute(portfolio: Portfolio): PortfolioMetrics {
    const totalValue = portfolio.calculateTotalValue();
    const totalPnL = portfolio.calculateTotalPnL();
    const totalFees = portfolio.calculateTotalFeesEarned();

    const breakdown = portfolio.getDexBreakdown();
    const dexBreakdown = Array.from(breakdown.entries()).map(([dex, m]) => ({
      dex,
      positions: m.getPositionsCount(),
      valueUsd: m.getTotalValue().toNumber(),
      pnlUsd: m.getTotalPnL().getAbsolute().toNumber(),
    }));

    return {
      totalValueUsd: totalValue.toNumber(),
      totalPnLUsd: totalPnL.getAbsolute().toNumber(),
      totalPnLPercentage: totalPnL.getPercentage(),
      totalFeesUsd: totalFees.toNumber(),
      activePositions: portfolio.getActivePositionCount(),
      totalPositions: portfolio.getPositionCount(),
      dexBreakdown,
    };
  }
}
