import { UnifiedPortfolio, UnifiedPosition } from "@/types/core.types";
import { Portfolio } from "@/domain/portfolio/portfolio.entity";
import { bold, link } from "@/bot/utils/text-formatters";
import { formatCurrency, formatNumber, formatPercentage } from "./base.formatter";
import { getPositionDeeplink } from "@/bot/utils/misc";

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

  /**
   * Format a portfolio built from domain entities, optionally enriched with unified adapter data.
   * Params:
   *  - portfolio: domain Portfolio aggregate
   *  - opts.botName: for deep links (/start pos_<dex>_<positionAddress>)
   *  - opts.unclaimedFeesByAddress: map of position address -> unclaimed fees (USD)
   */
  static formatDomainOverview(
    portfolio: Portfolio,
    opts?: { botName?: string; unclaimedFeesByAddress?: Record<string, number> }
  ): string {
    const active = portfolio.getActivePositions();
    if (active.length === 0) {
      return [
        `❌ No active positions found.`,
        ``,
        `➡️ Use /trending to see hot pools`,
        `➡️ Or paste a token address to create new positions`,
      ].join('\n');
    }

    const header = bold('Portfolio Overview');
    const totalOpen = active.length;
    const totalDeposit = active.reduce((acc, p) => acc + p.getInitialValue().toNumber(), 0);
    const totalValue = active.reduce((acc, p) => acc + p.getCurrentValue().toNumber(), 0);

    const feesMap = opts?.unclaimedFeesByAddress ?? {};
    const botName = opts?.botName;

    const lines: string[] = [];
    lines.push(header);
    lines.push("");
    lines.push(`Total Open Positions: ${bold(String(totalOpen))} | Total Deposit: ${bold(formatCurrency(totalDeposit))} | Total Value: ${bold(formatCurrency(totalValue))}`);
    lines.push("");

    active.forEach((p, i) => {
      const pair = `${p.tokenX.symbol}-${p.tokenY.symbol}`;
      const title = botName
        ? link(`${i + 1}. ${pair}`, getPositionDeeplink(botName, p.dex, p.positionAddress))
        : `${i + 1}. ${pair}`;

      const x = p.getCurrentTokenXAmount().toFormattedString();
      const y = p.getCurrentTokenYAmount().toFormattedString();
      const usd = p.getCurrentValue().toNumber();
      const unclaimedUsd = feesMap[p.positionAddress] ?? 0;

      lines.push(title);
      lines.push(`Balance: ${bold(x)} / ${bold(y)} (${bold(formatCurrency(usd))})`);
      lines.push(`Unclaimed Fees: ${bold(formatCurrency(unclaimedUsd))}`);
      lines.push("");
    });

    // drop trailing blank line
    if (lines[lines.length - 1] === "") lines.pop();
    return lines.join('\n');
  }
}
