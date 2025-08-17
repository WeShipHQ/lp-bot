import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { userService } from "../../services/user.service";
import { MessageService } from "../../services/message.service";

interface BotContext extends Context {
  userId?: string; // thêm field để lưu id từ privy
}

export function startCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.start(async (ctx: BotContext) => {
    try {
      const telegramUserId = ctx.from?.id?.toString();
      if (!telegramUserId) {
        await ctx.reply(MessageService.getPrivateChatRequiredMessage());
        return;
      }

      // Get or create user using service
      const userInfo = await userService.getOrCreateUser(telegramUserId);
      
      // Set userId in context for later use
      ctx.userId = userInfo.id;

      // Get welcome message using service
      const welcomeMessage = MessageService.getWelcomeMessage(userInfo.walletAddress);

      await ctx.reply(welcomeMessage, {
        parse_mode: "HTML",
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
