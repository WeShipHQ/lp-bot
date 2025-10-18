import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { message } from "telegraf/filters";
import { BotContext } from "@/types/bot.types";
import { handleTwoFactorSetup, handleTwoFactorVerification, handleTwoFactorStatus, handleTwoFactorDisable } from "../handlers/two-factor-auth";
import { tempStoreService } from "@/services/temp-store.service";
import { getTwoFactorKeyboard, getTwoFactorSetupKeyboard } from "../keyboards/two-factor-menu";

// Import MessageService
import { MessageService } from "@/services/message.service";

// Helper functions
async function handleActionWithError(
  ctx: BotContext, 
  loadingMessage: string, 
  handler: () => Promise<void>
) {
  try {
    await ctx.answerCbQuery(loadingMessage);
    await handler();
  } catch (error) {
    console.error("Error in action handler:", error);
    await ctx.answerCbQuery("❌ Error processing request");
  }
}

async function handleVerifyReady(ctx: BotContext) {
  try {
    await ctx.answerCbQuery("✅ Ready to verify! Please enter your 6-digit code.");
    
    await ctx.editMessageText(MessageService.getTwoFactorReadyToVerifyMessage(), { 
      parse_mode: "Markdown",
      reply_markup: getTwoFactorSetupKeyboard()
    });
  } catch (error) {
    console.error("Error in verifyTwoFactorReady:", error);
    await ctx.answerCbQuery("❌ Error processing request");
  }
}

export function twoFactorAuthCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  // Main 2FA command - shows menu
  bot.command("twoFactor", async (ctx: BotContext) => {
    await ctx.reply(MessageService.getTwoFactorMenuMessage(), {
      parse_mode: "Markdown",
      reply_markup: getTwoFactorKeyboard()
    });
  });

  // Handle 2FA button callbacks from main menu
  bot.action("twoFactorAuth", async (ctx: BotContext) => {
    await ctx.editMessageText(MessageService.getTwoFactorMenuMessage(), {
      parse_mode: "Markdown",
      reply_markup: getTwoFactorKeyboard()
    });
  });
  
  // Action handlers
  bot.action("setupTwoFactor", (ctx) => handleActionWithError(ctx, "🔐 Setting up 2FA...", () => handleTwoFactorSetup(ctx, server)));
  bot.action("twoFactorStatus", (ctx) => handleActionWithError(ctx, "📊 Checking 2FA status...", () => handleTwoFactorStatus(ctx)));
  bot.action("disableTwoFactor", (ctx) => handleActionWithError(ctx, "❌ Disabling 2FA...", () => handleTwoFactorDisable(ctx)));
  bot.action("verifyTwoFactorReady", (ctx) => handleVerifyReady(ctx));

  // Navigation actions
  bot.action("back_to_2fa_menu", (ctx) => handleActionWithError(ctx, "🔙 Back to 2FA menu", async () => {
    await ctx.editMessageText(MessageService.getTwoFactorMenuMessage(), {
      parse_mode: "Markdown",
      reply_markup: getTwoFactorKeyboard()
    });
  }));

  // Handle 2FA verification via text message
  bot.on(message("text"), async (ctx, next) => {
    try {
      const messageText = (ctx.message as { text?: string })?.text || "";
      
      // Check if it's a 6-digit code (potential 2FA verification)
      if (/^\d{6}$/.test(messageText.trim())) {
        const telegramUserId = ctx.from?.id?.toString();
        
        if (telegramUserId) {
          const tempData = tempStoreService.getTemp2FAData(telegramUserId);
          
          if (tempData) {
            await handleTwoFactorVerification(ctx, messageText.trim());
            return;
          }
        }
      }
      
      await next();
    } catch (error) {
      console.error("Error in 2FA text handler:", error);
      await next();
    }
  });
}
