import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { formatCurrency } from "../utils/formatters";
import { getWalletKeyboard } from "../keyboards/wallet-menu";
import { solanaService } from "../../services/solana.service";
import { User } from "../../db";

interface BotContext extends Context {
  user?: User;
}

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    if (!ctx.user) {
      await ctx.reply("❌ Unable to authenticate user. Please try again.");
      return;
    }

    const user = ctx.user;

    if (!user.walletAddress) {
      await ctx.reply("❌ No wallet found. Please contact support.");
      return;
    }

    let solBalance = 0;
    try {
      solBalance = await solanaService.getBalance(user.walletAddress);
    } catch (error) {
      console.error("Error fetching SOL balance:", error);
    }

    const usdValue = solBalance * 196; // Same rate as start command

    let message = `🌴 *Welcome to WeBot: the easiest way to LP on Solana DEXes!*\n\n`;

    message += `🏦 *Your Wallet Balance:* ${solBalance.toFixed(3)} SOL (${formatCurrency(usdValue)})\n\n`;

    message += `*Wallet Address:*\n`;
    message += `\`${user.walletAddress}\` (tap to copy)\n\n`;

    message += `*Your Reflink:* https://webot.xyz/r/jsAmV (tap to copy)\n\n`;

    message += `Get started by depositing SOL in your wallet address.\n\n`;

    message += `Use /trending or enter token address in bot chat to create new positions!`;

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: getWalletKeyboard().inline_keyboard,
      },
    });
  } catch (error) {
    console.error("Error in wallet handler:", error);
    await ctx.reply("❌ Error loading wallet information. Please try again.");
  }
}
