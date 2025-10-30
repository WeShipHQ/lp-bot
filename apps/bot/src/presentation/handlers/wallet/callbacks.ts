import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { WALLET_CALLBACKS } from "@/presentation/constants/wallet.callbacks";
import { refreshWalletMessage } from "./render";
import {
  prepareTransferAllSol,
  prepareTransferSolAmount,
  prepareTransferAllTokens,
  prepareTransferTokensAmount,
  confirmTransfer,
  cancelTransfer,
} from "./transfer";
import {
  exportPrivateKeyAction,
  confirmFirstExport,
  cancelExport,
} from "./export";

export async function handleWalletCallback(ctx: BotContext, _server: FastifyInstance) {
  try {
    const callbackData =
      ctx.callbackQuery && "data" in ctx.callbackQuery
        ? String(ctx.callbackQuery.data ?? "")
        : "";

    if (!callbackData) {
      await ctx.answerCbQuery();
      return;
    }

    switch (callbackData) {
      case WALLET_CALLBACKS.ui.refresh:
        await refreshWalletMessage(ctx);
        break;

      case WALLET_CALLBACKS.ui.close:
        try {
          const messageId = ctx.callbackQuery?.message?.message_id;
          if (messageId && ctx.chat?.id) {
            await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            await ctx.answerCbQuery("✅ Wallet closed");
          } else {
            await ctx.reply("✅ Wallet closed");
            await ctx.answerCbQuery("✅ Wallet closed");
          }
        } catch {
          await ctx.answerCbQuery("❌ Failed to close wallet");
        }
        break;

      case WALLET_CALLBACKS.transfer.solAll:
        await ctx.answerCbQuery("⏳ Preparing to transfer all SOL");
        await prepareTransferAllSol(ctx);
        break;

      case WALLET_CALLBACKS.transfer.solAmount:
        await ctx.answerCbQuery("⏳ Preparing to transfer SOL");
        await prepareTransferSolAmount(ctx);
        break;

      case WALLET_CALLBACKS.transfer.tokenAll:
        await ctx.answerCbQuery("⏳ Preparing to transfer all tokens");
        await prepareTransferAllTokens(ctx);
        break;

      case WALLET_CALLBACKS.transfer.tokenAmount:
        await ctx.answerCbQuery("⏳ Preparing to transfer tokens");
        await prepareTransferTokensAmount(ctx);
        break;

      case WALLET_CALLBACKS.export.privateKey:
        await ctx.answerCbQuery("🔐 Checking export status...");
        await exportPrivateKeyAction(ctx);
        break;

      case WALLET_CALLBACKS.export.confirmFirst:
        await ctx.answerCbQuery("🔐 Exporting private key...");
        await confirmFirstExport(ctx);
        break;

      case WALLET_CALLBACKS.export.cancel:
        await ctx.answerCbQuery("✅ Export cancelled");
        await cancelExport(ctx);
        break;

      case WALLET_CALLBACKS.transfer.confirm:
        await ctx.answerCbQuery("⏳ Processing transfer...");
        await confirmTransfer(ctx);
        break;

      case WALLET_CALLBACKS.transfer.cancel:
        await ctx.answerCbQuery("✅ Transfer cancelled");
        await cancelTransfer(ctx);
        break;

      default:
        await ctx.answerCbQuery("❌ Unknown action");
        break;
    }

    await ctx.answerCbQuery();
  } catch {
    await ctx.answerCbQuery("❌ Error processing request");
  }
}
