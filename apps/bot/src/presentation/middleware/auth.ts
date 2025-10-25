import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { container } from "@/infrastructure/di/container";
import { ConnectWalletUseCase } from "@/application/wallet/connect-wallet.use-case";
import { findUserById } from "@/db/queries";

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return;
    }

    const telegramUserId = ctx.from.id.toString();
    const username = ctx.from.username ?? `Panda_${telegramUserId}`;

    try {
      const connectWalletUseCase = container.get(ConnectWalletUseCase);
      const { userId, privyUserId } = await connectWalletUseCase.execute(
        telegramUserId,
        undefined,
        username
      );

      const dbUser = await findUserById(userId);
      if (!dbUser) {
        throw new Error(
          `User record not found after wallet sync for telegramId=${telegramUserId}`
        );
      }

      ctx.user = dbUser;
      ctx.privyUserId = privyUserId;

      server.log.debug(
        { telegramUserId, userId },
        "Authenticated Telegram user"
      );

      return next();
    } catch (error) {
      server.log.error(
        { err: error, telegramUserId },
        "Auth middleware error"
      );

      try {
        if (ctx.updateType === "callback_query" && "answerCbQuery" in ctx) {
          await ctx.answerCbQuery("Authentication failed. Please try again.");
        } else if (ctx.chat?.id && "reply" in ctx) {
          await ctx.reply(
            "❌ Authentication failed. Please try again in a moment."
          );
        }
      } catch (notifyError) {
        server.log.error(
          { err: notifyError, telegramUserId },
          "Failed to notify user about auth error"
        );
      }
    }
  };
}
