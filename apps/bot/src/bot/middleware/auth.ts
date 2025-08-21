import { Context, MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { WalletWithMetadata } from "@privy-io/server-auth";
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
        user = await privy.importUser({
          linkedAccounts: [{ type: "telegram", telegramUserId }],
        });

        const wallet = await privy.walletApi.createWallet({
          chainType: "solana",
          owner: { userId: user.id },
          additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
        });
        walletAddress = wallet.address;

        server.log.info(`New user registered: ${telegramUserId}`);
      } else {
        // Find existing Privy wallet
        walletAddress = user.linkedAccounts.find(
          (a): a is WalletWithMetadata =>
            a.type === "wallet" && a.walletClientType === "privy"
        )?.address;
      }

      ctx.user = {
        id: user.id,
        walletAddress,
        telegramUserId,
      };

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error("Auth middleware error:", error);
    }

    return next();
  };
}
