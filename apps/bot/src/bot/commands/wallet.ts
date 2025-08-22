import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler, handleWalletCallback, handleTransferInput } from "../handlers";
import { BotContext } from "@/types/bot.types";

export function walletCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("wallet", (ctx) => walletHandler(ctx, server));
  
  // Register wallet actions
  bot.action(/^transfer_all_sol|transfer_x_sol|transfer_all_tokens|transfer_x_tokens|export_private_key|close_wallet|refresh_wallet|confirm_transfer|cancel_transfer$/, (ctx) => handleWalletCallback(ctx, server));
  
  // Register transfer text handler
  bot.on("text", async (ctx, next) => {
    console.log("Text handler triggered with message:", ctx.message);
    try {
      const handled = await handleTransferInput(ctx, server);
      console.log("Transfer handler result:", handled);
      if (!handled) {
        // If not handled by transfer handler, continue to next middleware
        await next();
      }
    } catch (error) {
      console.error("Error in transfer handler:", error);
      await next();
    }
  });
}
