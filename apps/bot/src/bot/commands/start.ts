import { Telegraf, Markup, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { db, User, users } from "../../db";
import { eq } from "drizzle-orm";
import { solanaService } from "../../services/solana.service";
import { portfolioHandler, walletHandler } from "../handlers";

interface BotContext extends Context {
  user?: User;
}

export function startCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.start(async (ctx: BotContext) => {
    try {
      if (!ctx.user) {
        await ctx.reply("❌ Unable to authenticate user. Please try again.");
        return;
      }

      const user = ctx.user;

      let solBalance = 0;
      try {
        solBalance = await solanaService.getBalance(user.walletAddress!);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
      }

      const walletInfo =
        `🏦 *Your Wallet Balance:* ${solBalance} SOL ($${(solBalance * 196).toFixed(3)})

` +
        `*Wallet Address:* \`${user.walletAddress}\` _(tap to copy)_

` +
        `*Your Reflink:* https://webotttttt.com/r/abcd _(tap to copy)_

` +
        `Get started by depositing SOL in your wallet address.
`;

      const welcomeMessage =
        `🚀 *Welcome to Meteora Liquidity Assistant!*

` +
        `I'm here to help you maximize your DeFi yields on Solana through intelligent liquidity provision on Meteora.

` +
        walletInfo +
        `*What I can do for you:*
` +
        `• 📊 Find optimal liquidity pools for any token
` +
        `• 💰 Create concentrated spot positions
` +
        `• 🔄 Auto-rebalance to maximize fees
` +
        `• 📈 Track your portfolio performance
` +
        `• ⚡ Minimize impermanent loss

` +
        `*Get started:*
` +
        `• Send me a token address to explore opportunities
` +
        `• Use /portfolio to view your positions
` +
        `• Use /settings to configure auto-rebalancing

` +
        `Ready to start earning? 💎`;

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: getMainKeyboard().inline_keyboard,
        },
      });
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply("❌ An error occurred. Please try again later.");
    }
  });

  bot.action("portfolio", async (ctx) => {
    return portfolioHandler(ctx, _server);
  });

  bot.action("wallet", async (ctx) => {
    return walletHandler(ctx, _server);
  });

  // Handle refresh balance callback
  // bot.command("refresh_balance", async (ctx) => {
  //   try {
  //     const telegramId = ctx.from?.id?.toString();
  //     if (!telegramId) return;

  //     const user = await db.query.users.findFirst({
  //       where: eq(users.telegramId, telegramId),
  //     });

  //     if (!user?.walletAddress) {
  //       await ctx.answerCbQuery("❌ Wallet not found");
  //       return;
  //     }

  //     const solBalance = await solanaService.getBalance(user.walletAddress);

  //     await ctx.answerCbQuery(`💰 Balance: ${solBalance.toFixed(4)} SOL`);
  //   } catch (error) {
  //     console.error("Error refreshing balance:", error);
  //     await ctx.answerCbQuery("❌ Error refreshing balance");
  //   }
  // });
}
