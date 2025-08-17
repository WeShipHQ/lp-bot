import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { handleWalletCallback } from "./handlers/wallet";
import { userService } from "../services/user.service";

interface BotContext extends Context {
  userId?: string; // Privy user ID
}

export async function setupBotCommands(bot: Telegraf<BotContext>, server: FastifyInstance) {
  // Setup middleware
  setupMiddleware(bot, server);

  bot.on("inline_query", async (ctx) => {
    console.log("inline_query", ctx);
  });

  // Handle callback queries for wallet buttons
  bot.on("callback_query", async (ctx) => {
    try {
      // Type guard to check if callback query has data
      if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
        return;
      }

      const callbackData = ctx.callbackQuery.data;
      if (!callbackData) return;

      console.log("🔍 Callback data received:", callbackData);

      // Check if it's a wallet-related callback
      if (callbackData.startsWith("transfer_") || 
          callbackData.startsWith("export_") || 
          callbackData === "view_on_solscan" ||
          callbackData === "close_wallet" ||
          callbackData === "refresh_wallet" ||
          callbackData.includes(":")) {
        
        // Parse callback data to extract action and userId
        // Privy user ID format: did:privy:xxx, so we need to split only on first colon
        const firstColonIndex = callbackData.indexOf(":");
        if (firstColonIndex === -1) {
          await ctx.reply("❌ Invalid callback data format");
          return;
        }
        
        const action = callbackData.substring(0, firstColonIndex);
        const userId = callbackData.substring(firstColonIndex + 1);
        
        console.log("🔍 Parsed callback:", { action, userId });
        
        if (userId) {
          // Get user info from Privy API using userId from callback data
          console.log("🔍 Fetching user with ID:", userId);
          const userInfo = await userService.getUserById(userId);
          
          console.log("🔍 User info result:", userInfo ? "Found" : "Not found");
          
          if (userInfo) {
            await handleWalletCallback(ctx, action, userInfo);
          } else {
            await ctx.reply("❌ User not found");
          }
        } else {
          // Handle legacy callbacks without userId (fallback)
          if (callbackData === "refresh_wallet" || callbackData === "close_wallet") {
            await ctx.reply("❌ Please use the wallet command again");
          } else {
            await ctx.reply("❌ Invalid callback data");
          }
        }
      }
      
      // Answer callback query to remove loading state
      await ctx.answerCbQuery();
    } catch (error) {
      console.error("Error handling callback query:", error);
      await ctx.answerCbQuery("❌ Error occurred");
    }
  });

  // Register commands
  registerCommands(bot, server);

  // Global error handler
  bot.catch((err, ctx) => {
    server.log.error(`Bot error for ${ctx.updateType}:`, err);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
