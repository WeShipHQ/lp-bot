import { MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { privy } from "../../services/privy.service";
import { CONFIG } from "../../config";
import { BotContext } from "@/types/bot.types";
import { User } from "@/db";
import { createUser, findUserByTelegramId } from "@/db/queries";

// interface PrivyUser {
//   id: string;
//   customMetadata?: {
//     walletAddress?: string;
//     walletId?: string;
//     [key: string]: unknown;
//   };
// }

// interface CachedUserData {
//   user: PrivyUser;
//   walletAddress: string;
//   walletId: string;
//   timestamp: number;
// }

// const userCache = new Map<string, CachedUserData>();

// 5 minutes
// const CACHE_TTL = 5 * 60 * 1000;

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

        server.log.info(`New user registered: ${telegramUserId} with wallet: ${walletAddress}`);
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

      ctx.user = dbUser;

      // userCache.set(telegramUserId, {
      //   user,
      //   walletAddress,
      //   walletId,
      //   timestamp: Date.now(),
      // });

      server.log.info(`User authenticated: ${telegramUserId}`);
    } catch (error) {
      server.log.error({ err: error }, "Auth middleware error");
    }

    return next();
  };
}

// import { MiddlewareFn } from "telegraf";
// import { FastifyInstance } from "fastify";
// import { privy } from "../../services/privy.service";
// // import { WalletWithMetadata } from "@privy-io/server-auth";
// import { CONFIG } from "../../config";
// import { BotContext } from "@/types/bot.types";
// import { createUser, findUserByTelegramId } from "@/db/queries";
// import { User } from "@/db";

// export function authMiddleware(
//   server: FastifyInstance
// ): MiddlewareFn<BotContext> {
//   return async (ctx, next) => {
//     if (!ctx.from) return;

//     const telegramUserId = ctx.from.id.toString();

//     try {
//       let user = await privy.getUserByTelegramUserId(telegramUserId);
//       console.log("user", user);
//       let walletAddress: string | undefined;
//       let dbUser: User | undefined = undefined;

//       if (!user) {
//         user = await privy.importUser({
//           linkedAccounts: [{ type: "telegram", telegramUserId }],
//         });

//         if (!user) {
//           ctx.reply("❌ Error occurred.");
//           return;
//         }

//         const wallet = await privy.walletApi.createWallet({
//           chainType: "solana",
//           ownerId: CONFIG.PRIVY.PRIVY_AUTH_ID,
//           additionalSigners: [{ signerId: CONFIG.PRIVY.PRIVY_AUTH_ID }],
//         });

//         user = await privy.importUser({
//           linkedAccounts: [{ type: "telegram", telegramUserId }],
//           customMetadata: {
//             walletId: wallet.id,
//             walletAddress: wallet.address,
//           },
//         });

//         walletAddress = wallet.address;

//         dbUser = await createUser({
//           telegramId: telegramUserId,
//           walletAddress,
//           username: ctx.from.username,
//         });

//         server.log.info(`New user registered: ${telegramUserId}`);
//       } else {
//         // walletAddress = user.linkedAccounts.find(
//         //   (a): a is WalletWithMetadata =>
//         //     a.type === "wallet" && a.walletClientType === "privy"
//         // )?.address;
//         dbUser = await findUserByTelegramId(telegramUserId);
//         if (!dbUser) {
//           dbUser = await createUser({
//             telegramId: telegramUserId,
//             walletAddress,
//             username: ctx.from.username,
//           });
//         }
//       }

//       // ctx.user = {
//       //   id: user.id,
//       //   walletAddress,
//       //   telegramUserId,
//       // };

//       ctx.user = dbUser;

//       server.log.info(`User authenticated: ${telegramUserId}`);
//     } catch (error) {
//       server.log.error({ err: error }, "Auth middleware error");
//     }

//     return next();
//   };
// }
