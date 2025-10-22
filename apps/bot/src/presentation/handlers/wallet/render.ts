import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { GetBalanceUseCase } from "@/application/wallet/get-balance.use-case";
import { GetTopTokenBalancesUseCase } from "@/application/wallet/get-top-token-balances.use-case";
import { solanaService } from "@/services/solana.service";
import { WalletFormatter } from "@/presentation/formatters/wallet.formatter";
import { MessageService } from "@/application/message/message.service";
import { createTextMessage } from "@/presentation/formatters/message-builder";

export async function walletHandler(ctx: BotContext, _server: FastifyInstance) {
  try {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const messageService = container.get<MessageService>(
      DI_TOKENS.MessageService
    );

    const user = ctx.user;

    if (!user.walletAddress || user.walletAddress.trim() === "") {
      await messageService.send({
        context: { chatId },
        payload: createTextMessage(
          "wallet.creating",
          "⏳ *Wallet Still Creating*\n\nYour wallet is being set up. Please wait a moment and try again.\n\nIf this persists, please contact support.",
          { parseMode: "markdown" }
        ),
      });
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
      topTokens = [];
    }

    const usdValue = solBalance * solPrice;
    const payload = WalletFormatter.createWalletSummaryPayload(
      user.walletAddress,
      solBalance,
      usdValue,
      topTokens
    );

    await messageService.send({
      context: { chatId },
      payload,
    });
  } catch (error) {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const messageService = container.get<MessageService>(
      DI_TOKENS.MessageService
    );
    await messageService.send({
      context: { chatId },
      payload: createTextMessage(
        "wallet.error",
        "Error loading wallet information. Please try again."
      ),
    });
  }
}

export async function refreshWalletMessage(ctx: BotContext) {
  const wallet = ctx.user?.walletAddress;
  if (!wallet) {
    await ctx.answerCbQuery("❌ No wallet address found");
    return;
  }

  const chatId = ctx.chat?.id;
  const messageId = ctx.callbackQuery?.message?.message_id;
  if (!chatId || !messageId) {
    await ctx.answerCbQuery("❌ Cannot find message to update");
    return;
  }

  const messageService = container.get<MessageService>(
    DI_TOKENS.MessageService
  );

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
  const payload = WalletFormatter.createWalletSummaryPayload(
    wallet,
    solBalance,
    usdValue,
    topTokens
  );

  try {
    await messageService.edit({
      context: { chatId, messageId },
      payload,
    });

    await ctx.answerCbQuery("🔄 Wallet refreshed!");
  } catch (err: any) {
    const desc = err?.response?.description || err?.description || "";
    if (desc.includes("message is not modified")) {
      await ctx.answerCbQuery("✅ Wallet already up-to-date");
    } else {
      await ctx.answerCbQuery("❌ Failed to update message");
    }
  }
}
