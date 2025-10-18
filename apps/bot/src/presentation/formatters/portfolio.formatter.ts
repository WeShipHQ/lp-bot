import { UnifiedPortfolio, UnifiedPosition } from "@/types/core.types";
import { bold } from "@/bot/utils/text-formatters";
import { formatCurrency, formatNumber, formatPercentage } from "./base.formatter";

export class PortfolioFormatter {
  static formatOverview(portfolio: UnifiedPortfolio): string {
    const positions = portfolio.positions ?? [];
    if (positions.length === 0) {
      return [
        `❌ No active positions found.`,
        ``,
        `➡️ Use /trending to see hot pools`,
        `➡️ Or paste a token address to create new positions`,
      ].join('\n');
    }

    const header = bold('Portfolio Overview');
    const totalPositions = positions.length;
    const totalValue = positions.reduce((acc, p) => acc + p.currentValueUsd, 0);

    let msg = `${header}\n\n`;
    msg += `Total Positions: ${bold(String(totalPositions))} | Total Balance: ${bold(formatCurrency(totalValue, { maxDecimals: 3 }))}`;

    return msg;
  }

  static formatPositionList(positions: UnifiedPosition[]): string {
    return positions
      .map((pos, i) => {
        const amountA = Number(pos.tokenAAmount) / Math.pow(10, pos.tokenA.decimals);
        const amountB = Number(pos.tokenBAmount) / Math.pow(10, pos.tokenB.decimals);
        return `/${i + 1} ${pos.tokenA.symbol}-${pos.tokenB.symbol} ${formatNumber(amountA, { maxDecimals: 3 })}/${formatNumber(amountB, { maxDecimals: 3 })}`;
      })
      .join('\n');
  }

  static formatMetrics(metrics: { totalValueUsd: number; pnlUsd: number; pnlPct?: number; feesUsd?: number }): string {
    const parts = [
      `Total Value: ${formatCurrency(metrics.totalValueUsd)}`,
      `PnL: ${formatCurrency(metrics.pnlUsd)}${metrics.pnlPct != null ? ` (${formatPercentage(metrics.pnlPct, { decimals: 2, alwaysShowSign: true })})` : ''}`,
      metrics.feesUsd != null ? `Fees: ${formatCurrency(metrics.feesUsd)}` : undefined,
    ].filter(Boolean) as string[];
    return parts.join('\n');
  }
}
