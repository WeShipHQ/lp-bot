import { formatCurrency } from "@/bot/utils/formatters";
import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";

const fmtPct = (x?: number) => {
  if (x === undefined || x === null) return "—";
  const v = x > 1 ? x : x * 100;
  return `${v.toFixed(2)}%`;
};
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
    const header =
      `💼 Wallet: \`${data.walletAddress}\`\n` +
      `Total Positions: ${t.total_positions} | Total Deposit: ${formatCurrency(t.total_current_value_usd)}\n\n`;

    const body = list
      .map((p, i) => {
        const line1 = `/${i + 1} ${pair(p)}`;
        const line2 = `• Pool: \`${p.pool_address}\``;
        const line3 = `• Address: \`${p.position_address}\``;

        const balance =
          (p as any).current_x_amount != null &&
          (p as any).current_y_amount != null
            ? `• Position Balance: ${fmtAmt((p as any).current_x_amount)} ${p.token_x_info.symbol} / ${fmtAmt(
                (p as any).current_y_amount
              )} ${p.token_y_info.symbol} (${formatCurrency(p.current_value_usd)})`
            : `• Position Balance: ${formatCurrency(p.current_value_usd)}`;

        const unclaimed =
          (p as any).unclaimed_fees_x != null &&
          (p as any).unclaimed_fees_y != null
            ? `• Unclaimed Fees: ${fmtAmt((p as any).unclaimed_fees_x)} ${p.token_x_info.symbol} / ${fmtAmt(
                (p as any).unclaimed_fees_y
              )} ${p.token_y_info.symbol} (${formatCurrency(p.total_unclaimed_fees_usd)})`
            : `• Unclaimed Fees: ${formatCurrency(p.total_unclaimed_fees_usd)}`;

        const claimed =
          p.total_claimed_fees_usd > 0
            ? (p as any).claimed_fees_x != null &&
              (p as any).claimed_fees_y != null
              ? `• Claimed Fees: ${fmtAmt((p as any).claimed_fees_x)} ${p.token_x_info.symbol} / ${fmtAmt(
                  (p as any).claimed_fees_y
                )} ${p.token_y_info.symbol} (${formatCurrency(p.total_claimed_fees_usd)})`
              : `• Claimed Fees: ${formatCurrency(p.total_claimed_fees_usd)}`
            : undefined;

        const feeTvl =
          p.pool_fee_tvl_24h != null
            ? `• 24h Fee / TVL: ${pct(p.pool_fee_tvl_24h)}`
            : undefined;
        const range = `• In Range: ${p.in_range ? "Yes" : "No"}`;
        const updated = `• Updated: ${p.created_at}`;

        return [
          line1,
          line2,
          line3,
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

    return header + body;
  }

  static getPositionDetailMessage(p: PortfolioPosition, index: number): string {
    const title = `#${index + 1} ${pair(p)}\n`;
    const lines: string[] = [];
    lines.push(`Pool: \`${p.pool_address}\``);
    lines.push(`Address: \`${p.position_address}\``);

    if (
      (p as any).current_x_amount != null &&
      (p as any).current_y_amount != null
    ) {
      lines.push(
        `Position Balance: ${fmtAmt((p as any).current_x_amount)} ${p.token_x_info.symbol} / ` +
          `${fmtAmt((p as any).current_y_amount)} ${p.token_y_info.symbol} (${formatCurrency(p.current_value_usd)})`
      );
    } else {
      lines.push(`Position Balance: ${formatCurrency(p.current_value_usd)}`);
    }

    if (
      (p as any).unclaimed_fees_x != null &&
      (p as any).unclaimed_fees_y != null
    ) {
      lines.push(
        `Unclaimed Fees: ${fmtAmt((p as any).unclaimed_fees_x)} ${p.token_x_info.symbol} / ` +
          `${fmtAmt((p as any).unclaimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_unclaimed_fees_usd)})`
      );
    } else {
      lines.push(
        `Unclaimed Fees: ${formatCurrency(p.total_unclaimed_fees_usd)}`
      );
    }

    if (p.total_claimed_fees_usd > 0) {
      if (
        (p as any).claimed_fees_x != null &&
        (p as any).claimed_fees_y != null
      ) {
        lines.push(
          `Claimed Fees: ${fmtAmt((p as any).claimed_fees_x)} ${p.token_x_info.symbol} / ` +
            `${fmtAmt((p as any).claimed_fees_y)} ${p.token_y_info.symbol} (${formatCurrency(p.total_claimed_fees_usd)})`
        );
      } else {
        lines.push(`Claimed Fees: ${formatCurrency(p.total_claimed_fees_usd)}`);
      }
    }

    if (p.pool_fee_tvl_24h != null)
      lines.push(`24h Fee / TVL: ${pct(p.pool_fee_tvl_24h)}`);
    lines.push(`In Range: ${p.in_range ? "Yes" : "No"}`);
    lines.push(`Updated: ${p.created_at}`);
    lines.push(`Dexscreener: ${dexUrl(p.pool_address)}`);

    return title + "\n" + lines.join("\n");
  }

  /**
   * Generate portfolio message
   */
  static getPortfolioMessage(data: PortfolioData): string {
    const list = data.positions ?? [];
    if (list.length === 0) return "❌ No LP positions found for this wallet.";

    // Fallback totals nếu caller chưa cung cấp
    const t = data.totals ?? {
      total_positions: list.length,
      total_current_value_usd: list.reduce(
        (s, p) => s + p.current_value_usd,
        0
      ),
      total_unclaimed_fees_usd: list.reduce(
        (s, p) => s + p.total_unclaimed_fees_usd,
        0
      ),
      total_claimed_fees_usd: list.reduce(
        (s, p) => s + p.total_claimed_fees_usd,
        0
      ),
      total_deposits_usd: list.reduce((s, p) => s + p.total_deposits_usd, 0),
      total_withdrawals_usd: list.reduce(
        (s, p) => s + p.total_withdrawals_usd,
        0
      ),
      total_pnl_usd: list.reduce((s, p) => s + p.pnl_usd, 0),
      total_net_deposited_usd: 0,
    };

    let msg = "📊 *Portfolio Overview:*\n\n";
    msg += `🏦 *Wallet:* \`${data.walletAddress}\`\n`;
    msg += `*Total Positions:* ${t.total_positions} | *Total Deposit:* ${formatCurrency(
      t.total_current_value_usd
    )}\n\n`;

    list.forEach((p, i) => {
      msg += `/${i + 1} ${p.token_x_info.symbol}-${p.token_y_info.symbol}\n`;
      msg += `• *Pool:* \`${p.pool_address}\`\n`;
      msg += `• *Address:* \`${p.position_address}\`\n`;
      msg += `• *Current Value (TVL):* ${formatCurrency(p.current_value_usd)}\n`;
      msg += `• *Unclaimed fees:* ${formatCurrency(p.total_unclaimed_fees_usd)}\n`;
      if (p.total_claimed_fees_usd > 0) {
        msg += `• *Claimed fees:* ${formatCurrency(p.total_claimed_fees_usd)}\n`;
      }
      if (p.pool_fee_tvl_24h !== undefined) {
        msg += `• *24h Fee / TVL:* ${fmtPct(p.pool_fee_tvl_24h)}\n`;
      }
      msg += `• *In Range:* ${p.in_range ? "🟢" : "🔴"}\n`;
      msg += `• *Updated:* ${p.created_at}\n\n`;
    });

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
