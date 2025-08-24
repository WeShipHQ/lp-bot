import { formatCurrency } from "@/bot/utils/formatters";

export class MessageService {
    /**
     * Generate welcome message for new users
     */
    static getWelcomeMessage(walletAddress?: string): string {
      let walletInfo: string;
      
      if (walletAddress) {
        walletInfo = `🏦 **Wallet Address:** \`${walletAddress}\` (tap to copy)\n\n`;
      } else {
        walletInfo = "🏦 **Wallet Status:** Creating wallet...\n\n" +
          "⏳ Please wait while we set up your Solana wallet.\n" +
          "This may take a few moments.\n\n";
      }
  
      return `🚀 **Welcome to Weship Liquidity Bot!**\n\n` +
        `The easiest way to LP on Solana DEXes.\n\n` +
        walletInfo +
        `Get started by depositing SOL in your wallet address.\n\n` +
        `👉 Use /trending or paste a token address to create new positions!`;
    }

    /**
     * Generate wallet message with balance and price information
     */
    static getWalletMessage(walletAddress: string, solBalance: number, usdValue: number): string {
      let message = `🏦 *Wallet SOL Balance:* ${solBalance.toFixed(3)} SOL (${formatCurrency(usdValue)})\n\n`;
      message += `*Wallet Address:*\n`;
      message += `\`${walletAddress}\` (tap to copy)\n\n`;
      
      return message;
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
     * Generate transfer SOL request message
     */
    static getTransferSolRequestMessage(): string {
      return "💸 *Transfer SOL*\n\nPlease enter the recipient's wallet address and the amount to transfer in the format:\n\n`address amount`\n\nExample: `GgS64xkW9JqR3VkBn4fpPi7sMqcnAzqRWTUXbBZhHpLT 0.1`\n\nOr type /cancel to cancel the transfer.";
    }

    /**
     * Generate transfer SOL confirmation message
     */
    static getTransferConfirmationMessage(recipientAddress: string, amount: number, usdValue: number): string {
      return `🔍 *Confirm Transfer*\n\n` +
        `You are about to send *${amount} SOL* (${formatCurrency(usdValue)}) to:\n` +
        `\`${recipientAddress}\`\n\n` +
        `Please confirm this transaction by clicking the button below.`;
    }

    /**
     * Generate transfer SOL success message
     */
    static getTransferSuccessMessage(recipientAddress: string, amount: number, signature: string): string {
      return `✅ *Transfer Successful*\n\n` +
        `Successfully sent *${amount} SOL* to:\n` +
        `\`${recipientAddress}\`\n\n` +
        `Transaction signature:\n` +
        `\`${signature}\`\n\n` +
        `View on Solscan: https://solscan.io/tx/${signature}`;
    }
    
    /**
     * Generate transfer SOL success message with amount adjustment
     */
    static getTransferSuccessWithAdjustmentMessage(recipientAddress: string, requestedAmount: number, actualAmount: number, signature: string): string {
      return `✅ *Transfer Successful*\n\n` +
        `You requested to send *${requestedAmount} SOL*, but the amount was adjusted to *${actualAmount} SOL* to account for transaction fees.\n\n` +
        `Successfully sent to:\n` +
        `\`${recipientAddress}\`\n\n` +
        `Transaction signature:\n` +
        `\`${signature}\`\n\n` +
        `View on Solscan: https://solscan.io/tx/${signature}`;
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
     * Generate transfer token confirmation message
     */
    static getTransferTokenConfirmationMessage(tokenSymbol: string, tokenName: string, recipientAddress: string, amount: number): string {
      return `🔍 *Confirm Token Transfer*\n\n` +
        `You are about to send *${amount} ${tokenSymbol}* (${tokenName}) to:\n` +
        `\`${recipientAddress}\`\n\n` +
        `Please confirm this transaction by clicking the button below.`;
    }

    /**
     * Generate transfer token success message
     */
    static getTransferTokenSuccessMessage(tokenSymbol: string, recipientAddress: string, amount: number, signature: string): string {
      return `✅ *Token Transfer Successful*\n\n` +
        `Successfully sent *${amount} ${tokenSymbol}* to:\n` +
        `\`${recipientAddress}\`\n\n` +
        `Transaction signature:\n` +
        `\`${signature}\`\n\n` +
        `View on Solscan: https://solscan.io/tx/${signature}`;
    }
}