import { UnifiedPosition } from "@/types/core.types";
import { bold } from "@/bot/utils/text-formatters";
import { formatCurrency, formatNumber, formatPercentage, formatTxLink } from "./base.formatter";

export class PositionFormatter {
  static formatSummary(pos: UnifiedPosition): string {
    const pair = `${pos.tokenA.symbol}-${pos.tokenB.symbol}`;
    const balanceA = Number(pos.tokenAAmount) / Math.pow(10, pos.tokenA.decimals);
    const balanceB = Number(pos.tokenBAmount) / Math.pow(10, pos.tokenB.decimals);

    const balance = `Position Balance: ${bold(formatNumber(balanceA, { maxDecimals: 6 }))} ${pos.tokenA.symbol} / ${bold(formatNumber(balanceB, { maxDecimals: 6 }))} ${pos.tokenB.symbol} (${bold(formatCurrency(Number(balanceA + balanceB), { maxDecimals: 3 }))})`;

    const pnl = `PnL: ${bold(formatCurrency(pos.pnlUsd, { maxDecimals: 2 }))} (${bold(formatPercentage(pos.pnlPercentage, { decimals: 2, alwaysShowSign: true }))})`;
    const status = `In Range: ${pos.inRange ? '🟢' : '🔴'}`;

    return [bold(pair), balance, pnl, status].join('\n');
  }

  static formatCreationSuccess(result: { signature: string; depositedUsd?: number }): string {
    const lines = [
      `✅ Position Created Successfully`,
      result.depositedUsd != null ? `Deposited: ${formatCurrency(result.depositedUsd)}` : undefined,
      `Transaction: ${formatTxLink(result.signature)}`,
    ].filter(Boolean) as string[];
    return lines.join('\n');
  }

  static formatCloseConfirmation(pos: UnifiedPosition): string {
    return [
      `🔍 Confirm Position Closure`,
      `Are you sure you want to close this position?`,
      `Position: ${pos.address}`,
      `This action cannot be undone.`,
    ].join('\n');
  }

  static formatFeeClaim(pos: UnifiedPosition): string {
    return [
      `💰 Claim LP Fees`,
      `Would you like to claim LP fees and swap to SOL?`,
      `Position: ${pos.address}`,
    ].join('\n');
  }
}
