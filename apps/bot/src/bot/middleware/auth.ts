import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";
import { User } from "@/db";
import { createUser, findUserByTelegramId } from "@/db/queries";
import { userSyncService } from "../../services/user-sync.service";

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return;
    const telegramUserId = ctx.from.id.toString();
    const username = ctx.from.username;

    try {
      let user = await privy.getUserByTelegramUserId(telegramUserId);
      let walletAddress: string;
      let walletId: string;
      let dbUser: User | undefined = undefined;

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

        dbUser = await createUser({
          telegramId: telegramUserId,
          username: ctx.from.username,
          walletAddress,
          walletId,
        });

        server.log.info(
          `New user registered: ${telegramUserId} with wallet: ${walletAddress}`
        );
      } else {
        walletAddress = user.customMetadata?.walletAddress as string;
        walletId = user.customMetadata?.walletId as string;

        dbUser = await findUserByTelegramId(telegramUserId);
        if (!dbUser) {
          dbUser = await createUser({
            telegramId: telegramUserId,
            username: ctx.from.username,
            walletAddress,
            walletId,
          });
        }
      }

      // Sync user to local database
      await userSyncService.syncUser({
        id: user.id,
        telegramId: telegramUserId,
        username,
        walletAddress,
        walletId,
      });

      ctx.user = dbUser;

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error({ err: error }, "Auth middleware error");
    }

    return next();
  };
}
