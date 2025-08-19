import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { userService } from "@/services/user.service";

interface BotContext extends Context {
  userId?: string;
}

export function startCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.start(async (ctx: BotContext) => {
    try {
      const telegramUserId = ctx.from?.id?.toString();
      if (!telegramUserId) {
        await ctx.reply(MessageService.getPrivateChatRequiredMessage());
        return;
      }

      const userInfo = await userService.getOrCreateUser(telegramUserId);
      
      ctx.userId = userInfo.id;

      const welcomeMessage = MessageService.getWelcomeMessage(userInfo.walletAddress);

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