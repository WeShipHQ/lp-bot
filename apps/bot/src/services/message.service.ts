export class MessageService {
    /**
     * Generate welcome message for new users
     */
    static getWelcomeMessage(walletAddress?: string): string {
      const walletInfo = walletAddress 
        ? `🏦 **Wallet Address:** \`${walletAddress}\` (tap to copy)\n\n`
        : "🏦 **Wallet Address:** \`Creating...\`\n\n";
  
      return `🚀 **Welcome to Weship Liquidity Bot!**\n\n` +
        `The easiest way to LP on Solana DEXes.\n\n` +
        walletInfo +
        `Get started by depositing SOL in your wallet address.\n\n` +
        `👉 Use /trending or paste a token address to create new positions!`;
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
  
  
  }