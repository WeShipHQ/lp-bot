import {
  formatCurrency,
  formatPercentage,
  formatTokenAmount,
} from "@/bot/utils/formatters";
import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";

const bold = (s: string) => `**${s}**`;

const buildDexScreenerUrl = (poolAddress: string) =>
  `https://dexscreener.com/solana/${poolAddress}`;

const formatPairSymbol = (p: PortfolioPosition) =>
  `${p.token_x_info.symbol}-${p.token_y_info.symbol}`;

const toPercentNumber = (value?: number): number | undefined =>
  value == null ? undefined : value > 1 ? value : value * 100;

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
    const positions = data.positions ?? [];
    const totals = data.totals;

    if (positions.length === 0) {
      return (
        `\n❌ No active positions found.\n\n` +
        `Get started by:\n\n` +
        `➡️ Use /trending to see hot pools\n` +
        `➡️ Or paste a token address to create new positions`
      );
    }

    let msg = `*Portfolio Overview*\n\n`;

    msg += `Total Positions: ${totals.total_positions} | Total Deposit: ${bold(formatCurrency(totals.total_current_value_usd))}\n\n`;

    msg += positions
      .map((pos, i) => {
        const title = `/${i + 1} ${formatPairSymbol(pos)}\n`;
        const dbTracked =
          pos.is_tracked_in_db != null
            ? `• Tracked in DB: ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"}`
            : undefined;

        const balance =
          pos.current_x_amount != null && pos.current_y_amount != null
            ? `• Position Balance: ${bold(formatTokenAmount(pos.current_x_amount, 3))} ${pos.token_x_info.symbol} / ${bold(formatTokenAmount(pos.current_y_amount, 3))} ${pos.token_y_info.symbol} (${bold(formatCurrency(pos.current_value_usd))})`
            : `• Position Balance: ${bold(formatCurrency(pos.current_value_usd))}`;

        const unclaimed =
          pos.unclaimed_fees_x != null && pos.unclaimed_fees_y != null
            ? `• Unclaimed Fees: ${bold(formatTokenAmount(pos.unclaimed_fees_x, 3))} ${pos.token_x_info.symbol} / ${bold(formatTokenAmount(pos.unclaimed_fees_y, 3))} ${pos.token_y_info.symbol} (${bold(formatCurrency(pos.total_unclaimed_fees_usd))})`
            : `• Unclaimed Fees: ${bold(formatCurrency(pos.total_unclaimed_fees_usd))}`;

        const claimed =
          pos.claimed_fees_x != null && pos.claimed_fees_y != null
            ? `• Claimed Fees: ${bold(formatTokenAmount(pos.claimed_fees_x, 3))} ${pos.token_x_info.symbol} / ${bold(formatTokenAmount(pos.claimed_fees_y, 3))} ${pos.token_y_info.symbol} (${bold(formatCurrency(pos.total_claimed_fees_usd))})\n`
            : `• Claimed Fees: ${bold(formatCurrency(pos.total_claimed_fees_usd))}\n`;

        const feeTvlPercent = toPercentNumber(pos.pool_fee_tvl_24h);
        const feeTvl =
          feeTvlPercent != null
            ? `• 24h Fee / TVL: ${bold(formatPercentage(feeTvlPercent))}`
            : "—";

        const inRange = `• In Range: ${pos.in_range ? "🟢" : "🔴"}`;

        return [title, dbTracked, balance, unclaimed, claimed, feeTvl, inRange]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    msg += `\n\n💡 Tap the inline button or type */1*, */2* ... to open details.`;

    return msg;
  }

  static getPositionDetailMessage(pos: PortfolioPosition): string {
    const pairName = formatPairSymbol(pos);
    const sx = pos.token_x_info.symbol;
    const sy = pos.token_y_info.symbol;

    let msg = `**${pairName}** · [Dexscreener](${buildDexScreenerUrl(pos.pool_address)})\n\n`;

    if (pos.is_tracked_in_db != null) {
      msg += `**• Tracked in DB:** ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"}\n`;
    }

    if (pos.current_x_amount != null && pos.current_y_amount != null) {
      msg += `**• Position Balance:** ${bold(formatTokenAmount(pos.current_x_amount, 3))} ${sx} / ${bold(formatTokenAmount(pos.current_y_amount, 3))} ${sy} (${bold(formatCurrency(pos.current_value_usd))})\n`;
    } else {
      msg += `**• Position Balance:** ${bold(formatCurrency(pos.current_value_usd))}\n`;
    }

    if (pos.unclaimed_fees_x != null && pos.unclaimed_fees_y != null) {
      msg += `**• Unclaimed Fees:** ${bold(formatTokenAmount(pos.unclaimed_fees_x, 3))} ${sx} / ${bold(formatTokenAmount(pos.unclaimed_fees_y, 3))} ${sy} (${bold(formatCurrency(pos.total_unclaimed_fees_usd))})\n`;
    } else {
      msg += `**• Unclaimed Fees:** ${bold(formatCurrency(pos.total_unclaimed_fees_usd))}\n`;
    }

    if (pos.claimed_fees_x != null && pos.claimed_fees_y != null) {
      msg += `**• Claimed Fees:** ${bold(formatTokenAmount(pos.claimed_fees_x, 3))} ${sx} / ${bold(formatTokenAmount(pos.claimed_fees_y, 3))} ${sy} (${bold(formatCurrency(pos.total_claimed_fees_usd))})\n`;
    } else {
      msg += `**• Claimed Fees:** ${bold(formatCurrency(pos.total_claimed_fees_usd))}\n`;
    }

    const feeTvlPercent = toPercentNumber(pos.pool_fee_tvl_24h);
    const feeTvlPart =
      feeTvlPercent != null
        ? `**• 24h Fee/TVL:** ${bold(formatPercentage(feeTvlPercent))}  •  `
        : "";

    msg += `\n`;
    msg += `${feeTvlPart}**In Range:** ${pos.in_range ? "🟢" : "🔴"}\n`;

    if (pos.created_at) {
      msg += `**• Created Date:** ${new Date(pos.created_at).toLocaleString()}\n\n`;
    }

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
