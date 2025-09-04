import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { message } from "telegraf/filters";
import { BotContext } from "@/types/bot.types";
import { handleTwoFactorSetup, handleTwoFactorVerification, handleTwoFactorStatus, handleTwoFactorDisable } from "../handlers/two-factor-auth";
import { tempStoreService } from "@/services/temp-store.service";
import { getTwoFactorKeyboard, getTwoFactorSetupKeyboard } from "../keyboards/two-factor-menu";

export function twoFactorAuthCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  // Main 2FA command - shows menu
  bot.command("twoFactor", async (ctx: BotContext) => {
    const message = 
      "🔐 **Two-Factor Authentication**\n\n" +
      "Choose an option below to manage your 2FA settings:\n\n" +
      "• **Setup 2FA** - Enable Two-Factor Authentication\n" +
      "• **Check Status** - View your current 2FA status\n" +
      "• **Disable 2FA** - Disable 2FA (contact support required)";

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: getTwoFactorKeyboard()
    });
  });

  // Handle 2FA button callbacks from main menu
  bot.action("twoFactorAuth", async (ctx: BotContext) => {
    const message = 
      "🔐 **Two-Factor Authentication**\n\n" +
      "Choose an option below to manage your 2FA settings:\n\n" +
      "• **Setup 2FA** - Enable Two-Factor Authentication\n" +
      "• **Check Status** - View your current 2FA status\n" +
      "• **Disable 2FA** - Disable 2FA (contact support required)";

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: getTwoFactorKeyboard()
    });
  });
  
  bot.action("setupTwoFactor", async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery("🔐 Setting up 2FA...");
      await handleTwoFactorSetup(ctx, server);
    } catch (error) {
      console.error("Error in setupTwoFactor:", error);
      await ctx.answerCbQuery("❌ Error setting up 2FA");
    }
  });
  
  bot.action("twoFactorStatus", async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery("📊 Checking 2FA status...");
      await handleTwoFactorStatus(ctx);
    } catch (error) {
      console.error("Error in twoFactorStatus:", error);
      await ctx.answerCbQuery("❌ Error checking status");
    }
  });
  
  bot.action("disableTwoFactor", async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery("❌ Disabling 2FA...");
      await handleTwoFactorDisable(ctx);
    } catch (error) {
      console.error("Error in disableTwoFactor:", error);
      await ctx.answerCbQuery("❌ Error disabling 2FA");
    }
  });
  
  bot.action("verifyTwoFactorReady", async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery("✅ Ready to verify! Please enter your 6-digit code.");
      
      await ctx.editMessageText(
        "🔐 **Ready to Verify 2FA!**\n\n" +
        "Please enter the 6-digit code from your Google Authenticator app.\n\n" +
        "**Example:** `123456`\n\n" +
        "Just type the code and send it as a message.",
        { 
          parse_mode: "Markdown",
          reply_markup: getTwoFactorSetupKeyboard()
        }
      );
    } catch (error) {
      console.error("Error in verifyTwoFactorReady:", error);
      await ctx.answerCbQuery("❌ Error processing request");
    }
  });

  // Navigation actions
  bot.action("back_to_2fa_menu", async (ctx: BotContext) => {
    try {
      await ctx.answerCbQuery("🔙 Back to 2FA menu");
      
      const message = 
        "🔐 **Two-Factor Authentication**\n\n" +
        "Choose an option below to manage your 2FA settings:\n\n" +
        "• **Setup 2FA** - Enable Two-Factor Authentication\n" +
        "• **Check Status** - View your current 2FA status\n" +
        "• **Disable 2FA** - Disable 2FA (contact support required)";

      await ctx.editMessageText(message, {
        parse_mode: "Markdown",
        reply_markup: getTwoFactorKeyboard()
      });
    } catch (error) {
      console.error("Error in back_to_2fa_menu:", error);
      await ctx.answerCbQuery("❌ Error navigating back");
    }
  });

  // Handle 2FA verification via text message
  bot.on(message("text"), async (ctx, next) => {
    try {
      const messageText = (ctx.message as any)?.text || "";
      
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
