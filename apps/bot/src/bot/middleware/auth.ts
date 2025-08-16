import { Context, MiddlewareFn } from "telegraf";
import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { users, wallets } from "../../db/schema";
import { Keypair } from "@solana/web3.js";

interface BotContext extends Context {
  user?: any;
}

export function authMiddleware(
  server: FastifyInstance
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      return;
    }

    const telegramId = ctx.from.id.toString();

    try {
      const existingUser = await server.db.query.users.findFirst({
        where: eq(users.telegramId, telegramId),
      });

      if (existingUser) {
        ctx.user = existingUser;
      } else {
        await server.db.transaction(async () => {
          const keypair = Keypair.generate();
          const publicKey = keypair.publicKey.toString();
          const privateKey = Buffer.from(keypair.secretKey).toString("base64");

          const [newWallet] = await server.db
            .insert(wallets)
            .values({
              userId: ctx.user.id,
              address: publicKey,
              privateKeyEncrypted: privateKey, // Storing unencrypted as requested
              isActive: true,
            })
            .returning();

          const newUser = await server.db
            .insert(users)
            .values({
              telegramId,
              username: ctx.from!.username || ctx.from!.first_name,
              walletAddress: newWallet.address
            })
            .returning();

          ctx.user = newUser[0];
          server.log.info(`New user registered: ${telegramId}`);
        });
      }
    } catch (error) {
      server.log.error("Auth middleware error:", error);
    }

    return next();
  };
}
