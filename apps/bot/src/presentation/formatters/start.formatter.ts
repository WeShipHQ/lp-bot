import { MessagePayload } from "@/domain/message";
import { WelcomeData } from "@/domain/start";
import { getMainKeyboard } from "@/presentation/keyboards/main-menu";
import { createTextMessage } from "./message-builder";

export class StartFormatter {
  static welcomeWithBalance(
    welcomeData: WelcomeData,
    solBalance: number,
    usdValue: number,
    referralMessage: string = ""
  ): MessagePayload {
    const walletInfo = this.buildWalletSection(welcomeData, {
      solBalance,
      usdValue,
      referralMessage,
    });

    const text =
      `🏝️ *Welcome to Panda LP Bot: the easiest way to LP on Solana DEXes!*\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `Use /trending or enter token address in bot chat to create new positions!` +
      referralMessage;

    return createTextMessage("start.welcome", text, {
      parseMode: "markdown",
      keyboard: getMainKeyboard(),
      disableLinkPreview: true,
    });
  }

  static unsupported(message: string): MessagePayload {
    return createTextMessage("start.unsupported", message, {
      parseMode: "markdown",
      disableLinkPreview: true,
    });
  }

  static error(errorType: string = "general"): MessagePayload {
    let text: string;
    switch (errorType) {
      case "user_creation":
        text = "❌ Failed to create user account. Please try again later.";
        break;
      case "wallet_data":
        text = "⚠️ Unable to fetch wallet data. Please try again later.";
        break;
      case "deep_link_parse":
        text = "❌ Invalid deep link format. Please check the link and try again.";
        break;
      case "unsupported_dex":
        text = "❌ Unsupported DEX. We currently support: meteora, saros";
        break;
      default:
        text = "❌ Something went wrong. Please try again later.";
        break;
    }

    return createTextMessage("start.error", text, {
      parseMode: "markdown",
      disableLinkPreview: true,
    });
  }

  private static buildWalletSection(
    welcomeData: WelcomeData,
    context: { solBalance: number; usdValue: number; referralMessage: string }
  ): string {
    if (!welcomeData.hasWallet()) {
      return (
        "🏦 *Wallet Status:* Creating wallet...\n\n" +
        "⏳ Please wait while we set up your Solana wallet.\n" +
        "This may take a few moments.\n\n"
      );
    }

    const { solBalance, usdValue } = context;
    let walletInfo = `🏦 *Your Wallet Balance:* ${solBalance.toFixed(2)} SOL ($${usdValue.toFixed(3)})\n\n`;
    walletInfo += `*Wallet Address:* \`${welcomeData.walletAddress}\` (tap to copy)\n\n`;

    if (welcomeData.hasReferralLink()) {
      walletInfo += `*Your Reflink:* ${welcomeData.referralLink} (tap to copy)\n\n`;
    }

    return walletInfo;
  }
}
