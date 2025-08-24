import { formatCurrency } from "@/bot/utils/formatters";
import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";

const pct = (x?: number) =>
  x == null ? "—" : `${(x > 1 ? x : x * 100).toFixed(2)}%`;

const fmtAmt = (n?: number) =>
  n == null
    ? "—"
    : Math.abs(n) >= 1
      ? n.toLocaleString(undefined, { maximumFractionDigits: 4 })
      : n.toLocaleString(undefined, { maximumFractionDigits: 6 });

const shortAddr = (a: string, head = 6, tail = 6) =>
  a.length > head + tail ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

const b = (s: string) => `**${s}**`;

const pair = (p: PortfolioPosition) =>
  `${p.token_x_info.symbol}-${p.token_y_info.symbol}`;

const dexUrl = (pool: string) => `https://dexscreener.com/solana/${pool}`;
export class MessageService {
  /**
   * Generate welcome message for new users
   */
  static getWelcomeMessage(walletAddress?: string): string {
    let walletInfo: string;

    if (walletAddress) {
      walletInfo = `🏦 **Wallet Address:** \`${walletAddress}\` (tap to copy)\n\n`;
    } else {
      walletInfo =
        "🏦 **Wallet Status:** Creating wallet...\n\n" +
        "⏳ Please wait while we set up your Solana wallet.\n" +
        "This may take a few moments.\n\n";
    }

    return (
      `🚀 **Welcome to Weship Liquidity Bot!**\n\n` +
      `The easiest way to LP on Solana DEXes.\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `👉 Use /trending or paste a token address to create new positions!`
    );
  }

  /**
   * Generate wallet message with balance and price information
   */
  static getWalletMessage(
    walletAddress: string,
    solBalance: number,
    usdValue: number
  ): string {
    let message = `🏦 *Wallet SOL Balance:* ${solBalance.toFixed(3)} SOL (${formatCurrency(usdValue)})\n\n`;
    message += `*Wallet Address:*\n`;
    message += `\`${walletAddress}\` (tap to copy)\n\n`;

    return message;
  }

  static getPortfolioOverviewMessage(data: PortfolioData): string {
    const list = data.positions ?? [];
    const t = data.totals;

    let msg = `\u{1F4BC} Wallet: \`${data.walletAddress}\`\n`;
    msg += `Total Positions: ${t.total_positions} | Total Deposit: ${b(formatCurrency(t.total_current_value_usd))}\n\n`;

    msg += list
      .map((p, i) => {
        const line1 = `/${i + 1} \`${pair(p)}\``;

        const balance =
          p.current_x_amount != null && p.current_y_amount != null
            ? `• Position Balance: ${b(fmtAmt(p.current_x_amount))} ${p.token_x_info.symbol} / ${b(fmtAmt(p.current_y_amount))} ${p.token_y_info.symbol} (${b(formatCurrency(p.current_value_usd))})`
            : `• Position Balance: ${b(formatCurrency(p.current_value_usd))}`;

        const unclaimed =
          p.unclaimed_fees_x != null && p.unclaimed_fees_y != null
            ? `• Unclaimed Fees: ${b(fmtAmt(p.unclaimed_fees_x))} ${p.token_x_info.symbol} / ${b(fmtAmt(p.unclaimed_fees_y))} ${p.token_y_info.symbol} (${b(formatCurrency(p.total_unclaimed_fees_usd))})`
            : `• Unclaimed Fees: ${b(formatCurrency(p.total_unclaimed_fees_usd))}`;

        const claimed =
          p.claimed_fees_x != null && p.claimed_fees_y != null
            ? `• Claimed Fees: ${b(fmtAmt(p.claimed_fees_x))} ${p.token_x_info.symbol} / ${b(fmtAmt(p.claimed_fees_y))} ${p.token_y_info.symbol} (${b(formatCurrency(p.total_claimed_fees_usd))})`
            : `• Claimed Fees: ${b(formatCurrency(p.total_claimed_fees_usd))}`;

        const feeTvl =
          p.pool_fee_tvl_24h != null
            ? `• 24h Fee / TVL: ${b(pct(p.pool_fee_tvl_24h))}`
            : undefined;

        const range = `• In Range: ${p.in_range ? "✅" : "❌"}`;
        const updated = `• Updated: ${p.created_at}`;

        return [
          line1,
          `• Pool: \`${p.pool_address}\``,
          `• Address: \`${p.position_address}\``,
          balance,
          unclaimed,
          claimed,
          feeTvl,
          range,
          updated,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    return msg;
  }

  static getPositionDetailMessage(p: PortfolioPosition, index: number): string {
    const name = pair(p);
    const sx = p.token_x_info.symbol;
    const sy = p.token_y_info.symbol;

    let msg = `**${name}** · [Dexscreener](${dexUrl(p.pool_address)})\n\n`;
    msg += `**Pool:** \`${shortAddr(p.pool_address)}\`  ·  **Address:** \`${shortAddr(p.position_address)}\`\n\n`;

    if (p.current_x_amount != null && p.current_y_amount != null) {
      msg += `**Position:** ${b(fmtAmt(p.current_x_amount))} ${sx} / ${b(fmtAmt(p.current_y_amount))} ${sy} (${b(formatCurrency(p.current_value_usd))})\n`;
    } else {
      msg += `**Position:** ${b(formatCurrency(p.current_value_usd))}\n`;
    }

    if (p.unclaimed_fees_x != null && p.unclaimed_fees_y != null) {
      msg += `**Unclaimed:** ${b(fmtAmt(p.unclaimed_fees_x))} ${sx} / ${b(fmtAmt(p.unclaimed_fees_y))} ${sy} (${b(formatCurrency(p.total_unclaimed_fees_usd))})\n`;
    } else {
      msg += `**Unclaimed:** ${b(formatCurrency(p.total_unclaimed_fees_usd))}\n`;
    }

    if (p.claimed_fees_x != null && p.claimed_fees_y != null) {
      msg += `**Claimed:** ${b(fmtAmt(p.claimed_fees_x))} ${sx} / ${b(fmtAmt(p.claimed_fees_y))} ${sy} (${b(formatCurrency(p.total_claimed_fees_usd))})\n`;
    } else {
      msg += `**Claimed:** ${b(formatCurrency(p.total_claimed_fees_usd))}\n`;
    }

    msg += `\n`;
    msg += `${p.pool_fee_tvl_24h != null ? `**24h Fee/TVL:** ${b(pct(p.pool_fee_tvl_24h))}  ·  ` : ""}**In Range:** ${p.in_range ? "✅" : "❌"}\n`;
    if (p.created_at)
      msg += `**Updated:** ${new Date(p.created_at).toLocaleString()}\n\n`;

    msg += `Net Profit: View on [Instafin](https://instafin.com)`;
    return msg;
  }

  /**
   * Generate error message
   */
  static getErrorMessage(
    message: string = "Something went wrong. Please try again later."
  ): string {
    return `❌ ${message}`;
  }

  /**
   * Generate private chat required message
   */
  static getPrivateChatRequiredMessage(): string {
    return "❌ Please start the bot in a private chat with me.";
  }
}
