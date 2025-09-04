import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";

interface PrivyUser {
  id: string;
  customMetadata?: {
    walletAddress?: string;
    walletId?: string;
    [key: string]: unknown;
  };
}

interface CachedUserData {
  user: PrivyUser;
  walletAddress: string;
  walletId: string;
  timestamp: number;
}

const userCache = new Map<string, CachedUserData>();

// 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return;

    const telegramUserId = ctx.from.id.toString();

    try {
      const cachedUser = userCache.get(telegramUserId);
      const now = Date.now();

      if (cachedUser && now - cachedUser.timestamp < CACHE_TTL) {
        ctx.user = {
          id: cachedUser.user.id,
          walletAddress: cachedUser.walletAddress,
          walletId: cachedUser.walletId,
          telegramUserId,
        };
        return next();
      }

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Privy API timeout")), 5000);
      });

      let user: PrivyUser | null = null;
      try {
        user = await Promise.race([
          privy.getUserByTelegramUserId(telegramUserId),
          timeoutPromise,
        ]);
      } catch (timeoutError) {
        if (cachedUser) {
          server.log.warn(
            `Using expired cache for user ${telegramUserId} due to API timeout`
          );
          ctx.user = {
            id: cachedUser.user.id,
            walletAddress: cachedUser.walletAddress,
            walletId: cachedUser.walletId,
            telegramUserId,
          };
          return next();
        } else {
          server.log.error(
            { err: timeoutError },
            "Privy API timeout and no cache available"
          );
          // Don't set ctx.user if there's a timeout and no cache
          return next();
        }
      }

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
        const customMetadata = user.customMetadata ?? {};
        walletAddress = customMetadata.walletAddress ?? "";
        walletId = customMetadata.walletId ?? "";
        
        if (!walletAddress || !walletId || walletAddress.trim() === "" || walletId.trim() === "") {
          const wallet = await privy.walletApi.createWallet({
            chainType: "solana",
            ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
            additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
          });

          // Update user with wallet info
          await privy.setCustomMetadata(user.id, {
            ...customMetadata,
            walletId: wallet.id,
            walletAddress: wallet.address,
          });

          walletAddress = wallet.address;
          walletId = wallet.id;

          server.log.info(`Wallet created for existing user: ${telegramUserId}`);
        }
      }

      ctx.user = {
        id: user.id,
        walletAddress,
        walletId,
        telegramUserId,
      };

      userCache.set(telegramUserId, {
        user,
        walletAddress,
        walletId,
        timestamp: Date.now(),
      });

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error({ err: error }, "Auth middleware error");
    }

    return next();
  };
}