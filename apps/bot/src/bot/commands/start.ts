import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { BotContext } from "@/types/bot.types";

export function startCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
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
}
