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
    msg += `Total Positions: ${t.total_positions} | Total Deposit: ${formatCurrency(t.total_current_value_usd)}\n\n`;

    msg += list
      .map((p, i) => {
        const line1 = `/${i + 1} \`${pair(p)}\``;
        const balance =
          p.current_x_amount != null && p.current_y_amount != null
            ? `• Position Balance: ${fmtAmt(p.current_x_amount)} ${p.token_x_info.symbol} / ${fmtAmt(p.current_y_amount)} ${p.token_y_info.symbol} (${formatCurrency(p.current_value_usd)})`
            : `• Position Balance: ${formatCurrency(p.current_value_usd)}`;

        const unclaimed =
          p.unclaimed_fees_x != null && p.unclaimed_fees_y != null
            ? `• Unclaimed Fees: ${fmtAmt(p.unclaimed_fees_x)} ${p.token_x_info.symbol} / ${fmtAmt(p.unclaimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_unclaimed_fees_usd)})`
            : `• Unclaimed Fees: ${formatCurrency(p.total_unclaimed_fees_usd)}`;

        const claimed =
          p.total_claimed_fees_usd > 0
            ? p.claimed_fees_x != null && p.claimed_fees_y != null
              ? `• Claimed Fees: ${fmtAmt(p.claimed_fees_x)} ${p.token_x_info.symbol} / ${fmtAmt(p.claimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_claimed_fees_usd)})`
              : `• Claimed Fees: ${formatCurrency(p.total_claimed_fees_usd)}`
            : undefined;

        const feeTvl =
          p.pool_fee_tvl_24h != null
            ? `• 24h Fee / TVL: ${pct(p.pool_fee_tvl_24h)}`
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
    const title = `#${index + 1} ${pair(p)}\n`;
    const lines: string[] = [];
    lines.push(`Pool: \`${p.pool_address}\``);
    lines.push(`Address: \`${p.position_address}\``);

    if (p.current_x_amount != null && p.current_y_amount != null) {
      lines.push(
        `Position Balance: ${fmtAmt(p.current_x_amount)} ${p.token_x_info.symbol} / ` +
          `${fmtAmt(p.current_y_amount)} ${p.token_y_info.symbol} (${formatCurrency(p.current_value_usd)})`
      );
    } else {
      lines.push(`Position Balance: ${formatCurrency(p.current_value_usd)}`);
    }

    if (p.unclaimed_fees_x != null && p.unclaimed_fees_y != null) {
      lines.push(
        `Unclaimed Fees: ${fmtAmt(p.unclaimed_fees_x)} ${p.token_x_info.symbol} / ` +
          `${fmtAmt(p.unclaimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_unclaimed_fees_usd)})`
      );
    } else {
      lines.push(
        `Unclaimed Fees: ${formatCurrency(p.total_unclaimed_fees_usd)}`
      );
    }

    if (p.total_claimed_fees_usd > 0) {
      if (p.claimed_fees_x != null && p.claimed_fees_y != null) {
        lines.push(
          `Claimed Fees: ${fmtAmt(p.claimed_fees_x)} ${p.token_x_info.symbol} / ` +
            `${fmtAmt(p.claimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_claimed_fees_usd)})`
        );
      } else {
        lines.push(`Claimed Fees: ${formatCurrency(p.total_claimed_fees_usd)}`);
      }
    }

    if (p.pool_fee_tvl_24h != null)
      lines.push(`24h Fee / TVL: ${pct(p.pool_fee_tvl_24h)}`);
    lines.push(`In Range: ${p.in_range ? "✅" : "❌"}`);
    lines.push(`Updated: ${p.created_at}`);
    lines.push(`Dexscreener: ${dexUrl(p.pool_address)}`);

    return title + "\n" + lines.join("\n");
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
