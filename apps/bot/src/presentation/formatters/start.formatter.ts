import { WelcomeData } from '../../domain/start';

export class StartFormatter {
  static formatWelcomeMessage(welcomeData: WelcomeData, referralMessage: string = ""): string {
    let walletInfo: string;

    if (welcomeData.hasWallet()) {
      if (welcomeData.hasBalance()) {
        const solBalance = welcomeData.getSolBalanceFromUsd(1); // We'll need to pass SOL price separately
        const usdValue = welcomeData.getUsdValue();
        walletInfo = `🏦 *Your Wallet Balance:* ${solBalance.toFixed(2)} SOL ($${usdValue.toFixed(3)})\n\n`;
      } else {
        walletInfo =
          `🏦 **Wallet Status:** Creating wallet...\n\n` +
          "⏳ Please wait while we set up your Solana wallet.\n" +
          "This may take a few moments.\n\n";
      }

      walletInfo += `*Wallet Address:* \`${welcomeData.walletAddress}\` (tap to copy)\n\n`;

      if (welcomeData.hasReferralLink()) {
        walletInfo += `*Your Reflink:* ${welcomeData.referralLink} (tap to copy)\n\n`;
      }
    } else {
      walletInfo =
        "🏦 *Wallet Status:* Creating wallet...\n\n" +
        "⏳ Please wait while we set up your Solana wallet.\n" +
        "This may take a few moments.\n\n";
    }

    return (
      `🏝️ *Welcome to Panda LP Bot: the easiest way to LP on Solana DEXes!*\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `Use /trending or enter token address in bot chat to create new positions!` +
      referralMessage
    );
  }

  static formatWelcomeMessageWithBalanceInfo(
    welcomeData: WelcomeData, 
    solBalance: number, 
    usdValue: number, 
    referralMessage: string = ""
  ): string {
    let walletInfo: string;

    if (welcomeData.hasWallet()) {
      walletInfo = `🏦 *Your Wallet Balance:* ${solBalance.toFixed(2)} SOL ($${usdValue.toFixed(3)})\n\n`;
      walletInfo += `*Wallet Address:* \`${welcomeData.walletAddress}\` (tap to copy)\n\n`;

      if (welcomeData.hasReferralLink()) {
        walletInfo += `*Your Reflink:* ${welcomeData.referralLink} (tap to copy)\n\n`;
      }
    } else {
      walletInfo =
        "🏦 *Wallet Status:* Creating wallet...\n\n" +
        "⏳ Please wait while we set up your Solana wallet.\n" +
        "This may take a few moments.\n\n";
    }

    return (
      `🏝️ *Welcome to Panda LP Bot: the easiest way to LP on Solana DEXes!*\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `Use /trending or enter token address in bot chat to create new positions!` +
      referralMessage
    );
  }

  static formatErrorMessage(errorType: string = "general"): string {
    switch (errorType) {
      case "user_creation":
        return "❌ Failed to create user account. Please try again later.";
      case "wallet_data":
        return "⚠️ Unable to fetch wallet data. Please try again later.";
      case "deep_link_parse":
        return "❌ Invalid deep link format. Please check the link and try again.";
      case "unsupported_dex":
        return "❌ Unsupported DEX. We currently support: meteora, saros";
      default:
        return "❌ Something went wrong. Please try again later.";
    }
  }

  static formatUnsupportedMessage(message: string): string {
    return message;
  }
}