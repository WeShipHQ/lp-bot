import {
  formatCurrency,
  formatPercentage,
  formatTokenAmount,
} from "@/bot/utils/formatters";
import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";

const bold = (s: string) => `**${s}**`;
const italic = (s: string) => `_${s}_`;

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
            ? `• Tracked in DB: ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"} ${italic("(Click to add to DB)")}`
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
      msg += `**• Tracked in DB:** ${pos.is_tracked_in_db ? "🟢 Yes" : "🟠 No"} ${italic("(Click to add to DB)")}\n`;
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
   * Generate transfer SOL request message
   */
  static getTransferSolRequestMessage(): string {
    return "💸 *Transfer SOL*\n\nPlease enter the recipient's wallet address and the amount to transfer in the format:\n\n`address amount`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 0.1`\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer ALL SOL request message
   */
  static getTransferAllSolRequestMessage(): string {
    return "💸 *Transfer ALL SOL*\n\nPlease enter the recipient's wallet address:\n\n`address`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire SOL balance (minus transaction fees).\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer SOL confirmation message
   */
  static getTransferConfirmationMessage(
    recipientAddress: string,
    amount: number,
    usdValue: number
  ): string {
    return (
      `🔍 *Confirm Transfer*\n\n` +
      `You are about to send *${amount} SOL* (${formatCurrency(usdValue)}) to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Please confirm this transaction by clicking the button below.`
    );
  }

  /**
   * Generate transfer SOL success message
   */
  static getTransferSuccessMessage(
    recipientAddress: string,
    amount: number,
    signature: string
  ): string {
    return (
      `✅ *Transfer Successful*\n\n` +
      `Successfully sent *${amount} SOL* to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  /**
   * Generate transfer SOL success message with amount adjustment
   */
  static getTransferSuccessWithAdjustmentMessage(
    recipientAddress: string,
    requestedAmount: number,
    actualAmount: number,
    signature: string
  ): string {
    return (
      `✅ *Transfer Successful*\n\n` +
      `You requested to send *${requestedAmount} SOL*, but the amount was adjusted to *${actualAmount} SOL* to account for transaction fees.\n\n` +
      `Successfully sent to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  /**
   * Generate transfer SOL error message
   */
  static getTransferErrorMessage(error: string): string {
    return `❌ *Transfer Failed*\n\n${error}`;
  }

  /**
   * Generate transfer token request message
   */
  static getTransferTokenRequestMessage(): string {
    return "💸 *Transfer SPL Token*\n\nPlease enter the token address, recipient address, and amount to transfer in the format:\n\n`tokenAddress recipientAddress amount`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 10`\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer all tokens request message
   */
  static getTransferAllTokensRequestMessage(): string {
    return "💸 *Transfer All of a Token*\n\nPlease enter the token address and recipient address in the format:\n\n`tokenAddress recipientAddress`\n\nExample: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT`\n\nThis will transfer your entire balance of the specified token.\n\nNote: The recipient must have already interacted with this token before. They need to have a token account for this specific token.\n\nOr type /cancel to cancel the transfer.";
  }

  /**
   * Generate transfer token confirmation message
   */
  static getTransferTokenConfirmationMessage(
    tokenSymbol: string,
    tokenName: string,
    recipientAddress: string,
    amount: number
  ): string {
    return (
      `🔍 *Confirm Token Transfer*\n\n` +
      `You are about to send *${amount} ${tokenSymbol}* (${tokenName}) to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Please confirm this transaction by clicking the button below.`
    );
  }

  /**
   * Generate processing transaction message
   */
  static getProcessingTransactionMessage(): string {
    return "⏳ *Processing Transaction*\n\nYour transaction is being processed. Please wait a moment...\n\n_Please do not click the confirm button again to avoid duplicate transactions._";
  }

  /**
   * Generate wallet export message
   */
  static getWalletExportMessage(
    walletAddress: string,
    privateKey: string
  ): string {
    return (
      `🔐 *Wallet Export Successful*\n\n` +
      `*Address:* \`${walletAddress}\`\n` +
      `*Private Key:* \`${privateKey}\`\n\n` +
      `⚠️ **SECURITY WARNING:**\n` +
      `• Never share your private key with anyone\n` +
      `• Store it securely offline\n` +
      `• Anyone with this key can access your wallet\n\n`
    );
  }

  /**
   * Generate transfer token success message
   */
  static getTransferTokenSuccessMessage(
    tokenSymbol: string,
    recipientAddress: string,
    amount: number,
    signature: string
  ): string {
    return (
      `*Token Transfer Successful*\n\n` +
      `Successfully sent *${amount} ${tokenSymbol}* to:\n` +
      `\`${recipientAddress}\`\n\n` +
      `Transaction signature:\n` +
      `\`${signature}\`\n\n` +
      `View on Solscan: https://solscan.io/tx/${signature}`
    );
  }

  // 2FA Messages
  static getTwoFactorMenuMessage(): string {
    return (
      "🔐 **Two-Factor Authentication**\n\n" +
      "Choose an option below to manage your 2FA settings:\n\n" +
      "• **Setup 2FA** - Enable Two-Factor Authentication\n" +
      "• **Check Status** - View your current 2FA status\n" +
      "• **Disable 2FA** - Disable 2FA (contact support required)"
    );
  }

  static getTwoFactorAlreadyEnabledMessage(): string {
    return (
      "⚠️ **Two-Factor Authentication is already enabled!**\n\n" +
      "If you want to reset your 2FA, please contact support."
    );
  }

  static getTwoFactorNotEnabledMessage(): string {
    return (
      "ℹ️ **Two-Factor Authentication is not enabled**\n\n" +
      "Use `/setup-2fa` to enable 2FA for your account."
    );
  }

  static getTwoFactorSetupMessage(): string {
    return (
      "🔐 **Two-Factor Authentication Setup**\n\n" +
      "**Step 1:** Install Authenticator App on your phone\n\n" +
      "**Step 2:** Scan this QR code with Authenticator App:\n\n" +
      "**Step 3:** Enter the 6-digit code from your authenticator app\n\n" +
      "⚠️ **Important:**\n" +
      "• Keep your phone secure\n" +
      "• Don't share your authenticator app\n" +
      "• Contact support if you lose access\n\n"
    );
  }

  static getTwoFactorReadyToVerifyMessage(): string {
    return (
      "🔐 **Ready to Verify 2FA!**\n\n" +
      "Please enter the 6-digit code from your Authenticator App app.\n\n" +
      "**Example:** `123456`\n\n" +
      "Just type the code and send it as a message."
    );
  }

  static getTwoFactorEnabledSuccessMessage(): string {
    return (
      "✅ **Two-Factor Authentication Enabled Successfully!**\n\n" +
      "🔐 Your account is now protected with 2FA\n" +
      "📱 Use Authenticator App for future logins\n\n" +
      "⚠️ **Important Reminders:**\n" +
      "• Keep your phone secure\n" +
      "• Don't share your authenticator app\n" +
      "• Contact support if you lose access"
    );
  }

  static getTwoFactorInvalidCodeMessage(): string {
    return (
      "❌ **Invalid verification code!**\n\n" +
      "Please check your Authenticator App app and try again.\n" +
      "Make sure the code is current and entered correctly."
    );
  }

  static getTwoFactorNoSetupInProgressMessage(): string {
    return (
      "❌ **No 2FA setup in progress!**\n\n" +
      "Please click the 🔐 2FA button and setup 2FA first."
    );
  }

  static getTwoFactorDisableMessage(): string {
    return (
      "⚠️ **Disable Two-Factor Authentication**\n\n" +
      "This will remove 2FA protection from your account.\n\n" +
      "**To disable 2FA, please contact support** with:\n" +
      "• Your account verification\n" +
      "• Reason for disabling 2FA\n\n" +
      "For security reasons, 2FA cannot be disabled through the bot."
    );
  }

  static getTwoFactorStatusMessage(isEnabled: boolean): string {
    const status = isEnabled ? "✅ Enabled" : "❌ Disabled";
    const statusColor = isEnabled ? "🟢" : "🔴";
    
    return (
      `🔐 **Two-Factor Authentication Status**\n\n` +
      `${statusColor} **Status:** ${status}\n\n` +
      `**Security Tips:**\n` +
      `• Keep your phone secure\n` +
      `• Use a secure authenticator app\n` +
      `• Don't share your 2FA codes`
    );
  }

  static getTwoFactorRequiredForExportMessage(): string {
    return (
      "🔐 **2FA Required for Wallet Export**\n\n" +
      "For security reasons, you must enable Two-Factor Authentication before exporting your private key.\n\n" +
      "Please use the command `/twoFactor` to setup 2FA first.\n\n" +
      "⚠️ **Why 2FA is required:**\n" +
      "• Protects your private key from unauthorized access\n" +
      "• Adds an extra layer of security\n" +
      "• Required for sensitive operations"
    );
  }

  static getTwoFactorVerificationRequiredMessage(): string {
    return (
      "🔐 **2FA Verification Required**\n\n" +
      "Please enter your 6-digit authentication code from Authenticator App:\n\n" +
      "⏰ The code expires in 30 seconds\n" +
      "🔄 You have 3 attempts remaining\n\n" +
      "Type `/cancel` to cancel this operation."
    );
  }

  static getTwoFactorTooManyAttemptsMessage(): string {
    return (
      "❌ **Too Many Failed Attempts**\n\n" +
      "You have exceeded the maximum number of attempts. Please try again later."
    );
  }

  static getTwoFactorInvalidCodeWithAttemptsMessage(remainingAttempts: number): string {
    return (
      `❌ **Invalid Authentication Code**\n\n` +
      `Please check your Authenticator App app and try again.\n\n` +
      `🔄 Attempts remaining: ${remainingAttempts}\n` +
      `Type \`/cancel\` to cancel this operation.`
    );
  }
}
