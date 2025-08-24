import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";

// Simple in-memory cache for user data to reduce API calls
interface CachedUserData {
  user: {
    id: string;
    customMetadata?: {
      walletAddress?: string;
      walletId?: string;
    };
  };
  walletAddress: string;
  walletId: string;
  timestamp: number;
}

const userCache = new Map<string, CachedUserData>();

// Cache expiration time (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return;

    const telegramUserId = ctx.from.id.toString();

    try {
      // Check cache first
      const cachedUser = userCache.get(telegramUserId);
      const now = Date.now();
      
      if (cachedUser && (now - cachedUser.timestamp) < CACHE_TTL) {
        // Use cached data if not expired
        ctx.user = {
          id: cachedUser.user.id,
          walletAddress: cachedUser.walletAddress,
          walletId: cachedUser.walletId,
          telegramUserId,
        };
        return next();
      }
      
      // Set timeout for Privy API call
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Privy API timeout')), 5000);
      });
      
      // Race between API call and timeout
      let user;
      try {
        user = await Promise.race([
          privy.getUserByTelegramUserId(telegramUserId),
          timeoutPromise
        ]);
      } catch (timeoutError) {
        // If timeout occurred and we have cached data (even if expired), use it
        if (cachedUser) {
          server.log.warn(`Using expired cache for user ${telegramUserId} due to API timeout`);
          ctx.user = {
            id: cachedUser.user.id,
            walletAddress: cachedUser.walletAddress,
            walletId: cachedUser.walletId,
            telegramUserId,
          };
          return next();
        } else {
          // No cache available, log error and continue
          server.log.error({ err: timeoutError }, "Privy API timeout and no cache available");
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
        walletAddress = (user.customMetadata?.walletAddress as string) || '';
        walletId = (user.customMetadata?.walletId as string) || '';
      }

      // Update user context
      ctx.user = {
        id: user.id,
        walletAddress,
        walletId,
        telegramUserId,
      };
      
      // Update cache
      userCache.set(telegramUserId, {
        user,
        walletAddress,
        walletId,
        timestamp: Date.now()
      });

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error({ err: error }, "Auth middleware error");
    }

    return next();
  };
}
