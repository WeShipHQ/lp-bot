import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { getWalletKeyboard } from "../keyboards/wallet-menu";
import { solanaService } from "../../services/solana.service";
import { MessageService } from "../../services/message.service";
import { userService, UserInfo } from "../../services/user.service";
import { priceService } from "../../services/price.service";
import { exportAndDecryptWallet } from "../../services/wallet-export.service";

interface BotContext extends Context {
  userId?: string; // Privy user ID
}

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    const telegramUserId = ctx.from?.id?.toString();
    if (!telegramUserId) {
      await ctx.reply(MessageService.getAuthErrorMessage());
      return;
    }

    // Get user from Privy API
    let userInfo: UserInfo | null = null;
    
    try {
      // First try to get existing user
      userInfo = await userService.getUserByTelegramId(telegramUserId);
      
      // If user doesn't exist, create new one
      if (!userInfo) {
        userInfo = await userService.createUser(telegramUserId);
      }
    } catch (error) {
      console.error("Error getting/creating user:", error);
      await ctx.reply(MessageService.getErrorMessage("Failed to get user information. Please try again."));
      return;
    }

    if (!userInfo || !userInfo.walletAddress) {
      await ctx.reply(MessageService.getNoWalletMessage());
      return;
    }

    // Set userId in context for later use
    ctx.userId = userInfo.id;

    let solBalance = 0;
    try {
      solBalance = await solanaService.getBalance(userInfo.walletAddress);
    } catch (error) {
      console.error("Error fetching SOL balance:", error);
      // Continue with 0 balance if there's an error
    }
    
    // Get current SOL price from API
    let solPrice: number | undefined;
    try {
      solPrice = await priceService.getSolPrice();
    } catch (error) {
      console.error("Error fetching SOL price:", error);
      // Use fallback price
    }
    
    const usdValue = solPrice ? solBalance * solPrice : 0;

    // Generate wallet message using service
    const message = MessageService.getWalletMessage(userInfo.walletAddress, solBalance, usdValue);

    await ctx.reply(message, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: getWalletKeyboard(userInfo.id, userInfo.walletAddress).inline_keyboard,
      },
    });
  } catch (error) {
    console.error("Error in wallet handler:", error);
    await ctx.reply(MessageService.getErrorMessage("Error loading wallet information. Please try again."));
  }
}

// Callback handlers for wallet buttons
export async function handleWalletCallback(ctx: any, action: string, userInfo: UserInfo) {
  try {
    switch (action) {
      case "transfer_all_sol":
        await ctx.reply("🚧 Transfer all SOL functionality coming soon!");
        break;
        
      case "transfer_x_sol":
        await ctx.reply("🚧 Transfer X SOL functionality coming soon!");
        break;
        
      case "transfer_all_tokens":
        await ctx.reply("🚧 Transfer all tokens functionality coming soon!");
        break;
        
      case "transfer_x_tokens":
        await ctx.reply("🚧 Transfer X tokens functionality coming soon!");
        break;
        
      case "export_private_key":
        try {
          // Send initial message
          const loadingMsg = await ctx.reply("🔄 Exporting private key...");
          
          try {
            // Export and decrypt wallet using the service
            const privateKey = await exportAndDecryptWallet(userInfo.id);
            
            // Update message with success
            await ctx.telegram.editMessageText(
              ctx.chat?.id,
              loadingMsg.message_id,
              undefined,
              `✅ **Private Key Exported Successfully!**\n\n` +
              `🔑 **Wallet ID:** \`${userInfo.id}\`\n` +
              `🔐 **Private Key:** \`${privateKey}\`\n\n` +
              `⚠️ **Important Security Notes:**\n` +
              `• Keep this private key secure\n` +
              `• Never share with anyone\n` +
              `• Can be imported to MetaMask/Phantom\n\n` +
              `💡 **Instructions:**\n` +
              `1. Copy the private key\n` +
              `2. Open MetaMask/Phantom\n` +
              `3. Import Account > Private Key\n` +
              `4. Paste private key and confirm`,
              { parse_mode: "Markdown" }
            );
            
          } catch (error) {
            // Update message with error
            await ctx.telegram.editMessageText(
              ctx.chat?.id,
              loadingMsg.message_id,
              undefined,
              `❌ **Private Key Export Failed!**\n\n` +
              `🔑 **Wallet ID:** \`${userInfo.id}\`\n` +
              `🚫 **Error:** ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
              `💡 **Possible causes:**\n` +
              `• Wallet doesn't belong to you\n` +
              `• Wallet doesn't support export\n` +
              `• Privy API connection error\n` +
              `• Missing access permissions`,
              { parse_mode: "Markdown" }
            );
          }
        } catch (error) {
          console.error("Error in export private key:", error);
          await ctx.reply(MessageService.getErrorMessage("Failed to export private key"));
        }
        break;
        
      case "view_on_solscan":
        if (userInfo.walletAddress) {
          const solscanUrl = `https://solscan.io/account/${userInfo.walletAddress}`;
          await ctx.reply(`🔍 <a href="${solscanUrl}">View wallet on Solscan</a>`, {
            parse_mode: "HTML",
            disable_web_page_preview: true
          });
        } else {
          await ctx.reply("❌ No wallet address found");
        }
        break;
        
      case "close_wallet":
        await ctx.deleteMessage();
        break;
        
      case "refresh_wallet":
        // Refresh wallet data
        await ctx.deleteMessage();
        // Re-call wallet handler to refresh
        await walletHandler(ctx, null as any);
        break;
        
      default:
        await ctx.reply("❌ Unknown action");
    }
  } catch (error) {
    console.error("Error handling wallet callback:", error);
    await ctx.reply(MessageService.getErrorMessage());
  }
}
