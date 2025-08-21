import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return;

    const telegramUserId = ctx.from.id.toString();

    try {
      let user = await privy.getUserByTelegramUserId(telegramUserId);
      let walletAddress: string;
      let walletId: string;

      if (!user) {
        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
        });

        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
          customMetadata: {
            walletId: wallet.id,
            walletAddress: wallet.address,
          },
        });

        walletAddress = wallet.address;
        walletId = wallet.id;

        server.log.info(`New user registered: ${telegramUserId}`);
      } else {
        walletAddress = user.customMetadata?.walletAddress as string;
        walletId = user.customMetadata?.walletId as string;
      }

      ctx.user = {
        id: user.id,
        walletAddress,
        walletId,
        telegramUserId,
      };

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error({ err: error }, "Auth middleware error");
    }

    return next();
  };
}
