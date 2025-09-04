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

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return;

    const telegramUserId = ctx.from.id.toString();

    try {
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
        server.log.error(
          { err: timeoutError },
          "Privy API timeout"
        );
        return next();
      }

      let walletAddress: string;
      let walletId: string;

      if (!user) {
        server.log.info(`Creating new user for ${telegramUserId}`);
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

        server.log.info(`New user registered: ${telegramUserId} with wallet: ${walletAddress}`);
      } else {
        const customMetadata = user.customMetadata ?? {};
        walletAddress = customMetadata.walletAddress ?? "";
        walletId = customMetadata.walletId ?? "";
        
        server.log.info(`User ${telegramUserId} metadata:`, {
          hasCustomMetadata: !!user.customMetadata,
          walletAddress: `"${walletAddress}"`,
          walletId: `"${walletId}"`,
          walletAddressLength: walletAddress?.length || 0,
          walletIdLength: walletId?.length || 0,
          allMetadata: customMetadata
        });
        
        // Only create wallet if user truly has no wallet info
        const hasValidWallet = walletAddress && walletId && 
                              walletAddress.trim() !== "" && 
                              walletId.trim() !== "" &&
                              walletAddress !== "undefined" &&
                              walletId !== "undefined";
        
        server.log.info(`Wallet check for ${telegramUserId}:`, {
          hasValidWallet,
          walletAddress: `"${walletAddress}"`,
          walletId: `"${walletId}"`,
          willCreateNew: !hasValidWallet
        });
        
        if (!hasValidWallet) {
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
        } else {
          server.log.info(`Using existing wallet for user ${telegramUserId}: ${walletAddress}`);
        }
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