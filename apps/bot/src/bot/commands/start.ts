import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { message } from "telegraf/filters";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { BotContext } from "@/types/bot.types";
import { handleMainMenuCallback } from "../handlers/main-menu";
import { handleTwoFactorVerification } from "../handlers/two-factor-auth";
import { tempStoreService } from "@/services/temp-store.service";

export function startCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.start(async (ctx: BotContext) => {
    try {
      if (!ctx.user) {
        await ctx.reply(
          MessageService.getErrorMessage("Authentication failed")
        );
        return;
      }

      const welcomeMessage = MessageService.getWelcomeMessage(
        ctx.user.walletAddress
      );

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: getMainKeyboard().inline_keyboard,
        },
      });
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply(MessageService.getErrorMessage());
    }
  });

  // Handle 2FA button callbacks from main menu
  bot.action("two_factor_auth", (ctx) => handleMainMenuCallback(ctx, "two_factor_auth", server));
  bot.action("setup_2fa", (ctx) => handleMainMenuCallback(ctx, "setup_2fa", server));
  bot.action("verify_2fa_ready", (ctx) => handleMainMenuCallback(ctx, "verify_2fa_ready", server));

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
