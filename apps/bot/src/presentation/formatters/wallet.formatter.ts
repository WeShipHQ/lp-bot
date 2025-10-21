import { formatCurrency, formatNumber } from "./base.formatter";

export interface TopTokenBalance {
  mint: string;
  symbol: string;
  name?: string;
  balance: number;
  decimals?: number;
  priceUsd?: number | null;
}

export class WalletFormatter {
  static formatWalletSummary(
    walletAddress: string,
    solBalance: number,
    usdValue: number,
    topTokens?: TopTokenBalance[]
  ): string {
    let message = `🏦 *Wallet SOL Balance:* ${formatNumber(solBalance, {
      maxDecimals: 3,
    })} SOL (${formatCurrency(usdValue, { maxDecimals: 3 })})\n\n`;
    message += `*Wallet Address:*\n\`${walletAddress}\` (tap to copy)\n`;

    if (topTokens && topTokens.length > 0) {
      const lines: string[] = [];
      for (const t of topTokens.slice(0, 5)) {
        lines.push(
          `• ${t.symbol}: ${formatNumber(t.balance, { maxDecimals: 4 })}`
        );
      }
      if (lines.length > 0) {
        message += `\n*Top Tokens:*\n` + lines.join("\n");
      }
    }

    return message;
  }
}
