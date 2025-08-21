import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return;
    }

    const telegramUserId = ctx.from.id.toString();

    try {
      let user = await privy.getUserByTelegramUserId(telegramUserId);
      let walletAddress: string | undefined;

      if (!user) {

        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          ownerId : CONFIG.PRIVY.PRIVY_AUTH_ID,
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
        });

        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
          customMetadata : {
            walletId : wallet.id,
            walletAddress : wallet.address,
          }
        });

        server.log.info(`New user registered: ${telegramUserId}`);
      } else {
        walletAddress = user.customMetadata.walletAddress as string;
      }

      ctx.user = {
        id: user.id,
        walletAddress,
        walletId: user.customMetadata?.walletId as string,
        telegramUserId,
      };

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error("Auth middleware error:", error);
    }

    return next();
  };
}
