import { Telegraf, Composer } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import { walletHandler, handleWalletCallback, handleTransferInput } from "../handlers";
import { BotContext } from "@/types/bot.types";

export function walletCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("wallet", (ctx) => walletHandler(ctx, server));
  
  bot.action(/^transfer_all_sol|transfer_x_sol|transfer_all_tokens|transfer_x_tokens|export_private_key|close_wallet|refresh_wallet|confirm_transfer|cancel_transfer$/, (ctx) => handleWalletCallback(ctx, server));
  
  bot.on(message("text"), async (ctx, next) => {
    try {
      const handled = await handleTransferInput(ctx, server);
      if (!handled) {
        await next();
      }
    } catch (error) {
      console.error("Error in transfer handler:", error);
      await next();
    }
  });
}
