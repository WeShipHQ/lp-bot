export class MessageService {
  /**
   * Generate welcome message for new users
   */
  static getWelcomeMessage(walletAddress?: string): string {
    const walletInfo = walletAddress 
      ? `🏦 <b>Wallet Address:</b> <code>${walletAddress}</code> (tap to copy)\n\n`
      : "🏦 <b>Wallet Address:</b> <code>Creating...</code>\n\n";

    return `🚀 <b>Welcome to Weship Liquidity Bot!</b>\n\n` +
      `The easiest way to LP on Solana DEXes.\n\n` +
      walletInfo +
      `Get started by depositing SOL in your wallet address.\n\n` +
      `👉 Use /trending or paste a token address to create new positions!`;
  }

  /**
   * Generate wallet information message
   */
  static getWalletMessage(walletAddress: string, solBalance: number, usdValue: number): string {
    const balanceText = solBalance > 0 
      ? `${solBalance.toFixed(3)} SOL ($${usdValue.toFixed(2)})`
      : "0 SOL ($0)";

    return `🏦 <b>Wallet SOL Balance:</b> ${balanceText}\n\n` +
      `<b>Wallet Address:</b>\n` +
      `<code>${walletAddress}</code> (tap to copy)\n\n` +
      `Use the buttons below to manage your wallet.`;
  }

  /**
   * Generate error message
   */
  static getErrorMessage(message: string = "Something went wrong. Please try again later."): string {
    return `❌ ${message}`;
  }

  /**
   * Generate private chat required message
   */
  static getPrivateChatRequiredMessage(): string {
    return "❌ Please start the bot in a private chat with me.";
  }

  /**
   * Generate wallet creation message
   */
  static getWalletCreationMessage(walletAddress: string): string {
    return `🎉 <b>Wallet Created Successfully!</b>\n\n` +
      `🏦 <b>Wallet Address:</b> <code>${walletAddress}</code> (tap to copy)\n\n` +
      `Your Solana wallet is ready! You can now deposit SOL and start LPing.`;
  }

  /**
   * Generate no wallet found message
   */
  static getNoWalletMessage(): string {
    return "❌ No wallet found. Please contact support.";
  }

  /**
   * Generate authentication error message
   */
  static getAuthErrorMessage(): string {
    return "❌ Unable to authenticate user. Please try again.";
  }
}
