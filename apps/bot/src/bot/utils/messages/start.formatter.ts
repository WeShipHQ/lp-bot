import { BaseFormatter } from "./base.formatter";
import { MessageContext } from "@/types/messages.types";

export class StartFormatter extends BaseFormatter {
  static formatWelcomeMessage(context: MessageContext): string {
    const { walletAddress, solBalance = 0, usdValue = 0 } = context;

    let message = "🎉 **Welcome to Meteora Liquidity Bot!**\n\n";
    message += "🚀 Your gateway to automated liquidity provision on Solana\n\n";

    if (walletAddress) {
      message += "💼 **Your Wallet**\n";
      message += `📍 Address: \`${this.formatWalletAddress(walletAddress)}\`\n`;
      message += `💰 Balance: ${this.formatBalance(solBalance, usdValue)}\n\n`;
    } else {
      message += "🔗 **Get Started**\n";
      message +=
        "Connect your wallet to begin providing liquidity and earning fees!\n\n";
    }

    message += "📋 **What you can do:**\n";
    message += "• 📊 View trending pools\n";
    message += "• 💼 Manage your portfolio\n";
    message += "• 🔄 Create and manage positions\n";
    message += "• 💰 Track your earnings\n\n";
    message += "Use the menu below to get started! 👇";

    return message;
  }

  static formatReferralMessage(
    type: "success" | "invalid" | "already_used"
  ): string {
    switch (type) {
      case "success":
        return "\n\n🎉 **Welcome! You've been referred by a friend and earned 50 bonus points!**";
      case "invalid":
        return "\n\n⚠️ Invalid or expired referral code";
      case "already_used":
        return "\n\n ℹ️ You've already used a referral code.";
      default:
        return "";
    }
  }

  static formatErrorMessage(errorType: string): string {
    switch (errorType) {
      case "user_creation":
        return "❌ Error creating user account";
      case "balance_fetch":
        return "⚠️ Could not fetch wallet balance";
      case "deep_link":
        return "❌ Invalid link. Please try again.";
      default:
        return "❌ Something went wrong. Please try again later.";
    }
  }
}
