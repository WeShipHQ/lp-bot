import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { container } from "@/infrastructure/di/container";
import { GetBalanceUseCase } from "@/application/wallet/get-balance.use-case";
import { GetTopTokenBalancesUseCase } from "@/application/wallet/get-top-token-balances.use-case";
import { solanaService } from "@/services/solana.service";
import { WalletFormatter } from "@/presentation/formatters/wallet.formatter";
import { getWalletKeyboard } from "@/presentation/keyboards/wallet-menu";
// import { MessageService } from "@/services/message.service";

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    const user = ctx.user;

    if (!user.walletAddress || user.walletAddress.trim() === "") {
      try {
        await ctx.reply(
          `⏳ *Wallet Still Creating*\n\nYour wallet is being set up. Please wait a moment and try again.\n\nIf this persists, please contact support.`,
          {
            parse_mode: "Markdown",
          }
        );
      } catch (error) {
        await ctx.reply("No wallet found. Please contact support.");
      }

      return;
    }

    let solBalance = 0;
    let solPrice = 0;
    let topTokens: {
      mint: string;
      symbol: string;
      name?: string;
      balance: number;
      decimals?: number;
    }[] = [];

    try {
      const balanceUc = container.get(GetBalanceUseCase);
      const { sol } = await balanceUc.execute(user.walletAddress);
      solBalance = sol;
      solPrice = await solanaService.getSolPrice();
    } catch (error) {
      // Continue with 0 balance if fetch fails
    }

    try {
      const topTokensUc = container.get(GetTopTokenBalancesUseCase);
      topTokens = await topTokensUc.execute(user.walletAddress);
    } catch (error) {
      // Non-critical: ignore token balance errors
      topTokens = [];
    }

    const usdValue = solBalance * solPrice;
    const message = WalletFormatter.formatWalletSummary(
      user.walletAddress,
      solBalance,
      usdValue,
      topTokens
    );

    const keyboard = getWalletKeyboard(user.walletAddress);

    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard.inline_keyboard,
      },
    });
  } catch (error) {
    await ctx.reply("Error loading wallet information. Please try again.");
  }
}

export async function refreshWalletMessage(ctx: BotContext) {
  const wallet = ctx.user?.walletAddress;
  if (!wallet) {
    await ctx.answerCbQuery("❌ No wallet address found");
    return;
  }
  const balanceUc = container.get(GetBalanceUseCase);
  const { sol: solBalance } = await balanceUc.execute(wallet);
  const solPrice = await solanaService.getSolPrice();

  let topTokens: {
    mint: string;
    symbol: string;
    name?: string;
    balance: number;
    decimals?: number;
  }[] = [];
  try {
    const topTokensUc = container.get(GetTopTokenBalancesUseCase);
    topTokens = await topTokensUc.execute(wallet);
  } catch {}

  const usdValue = solBalance * solPrice;
  const messageText = WalletFormatter.formatWalletSummary(
    wallet,
    solBalance,
    usdValue,
    topTokens
  );
  const keyboard = getWalletKeyboard(wallet);

  const messageId = ctx.callbackQuery?.message?.message_id;
  const chatId = ctx.chat?.id;

  if (!messageId || !chatId) {
    await ctx.answerCbQuery("❌ Cannot find message to update");
    return;
  }

  try {
    await ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      messageText,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );

    await ctx.answerCbQuery("🔄 Wallet refreshed!");
  } catch (err: any) {
    if (err.description?.includes("message is not modified")) {
      await ctx.answerCbQuery("✅ Wallet already up-to-date");
    } else {
      await ctx.answerCbQuery("❌ Failed to update message");
    }
  }
}
