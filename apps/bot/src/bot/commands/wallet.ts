import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler, handleWalletCallback, handleTransferInput, handleTwoFactorInput } from "../handlers";
import { BotContext } from "@/types/bot.types";
import { message } from "telegraf/filters";

export function walletCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("wallet", (ctx) => walletHandler(ctx, server));

  bot.action("wallet", (ctx) => walletHandler(ctx, server));
  
  bot.action(/^transfer_all_sol|transfer_x_sol|transfer_all_tokens|transfer_x_tokens|export_private_key|close_wallet|refresh_wallet|confirm_transfer|cancel_transfer|confirm_first_export|cancel_export$/, (ctx) => handleWalletCallback(ctx, server));
  
  bot.on(message("text"), async (ctx, next) => {
    try {
      // Check 2FA input first
      const twoFactorHandled = await handleTwoFactorInput(ctx, server);
      if (twoFactorHandled) {
        return;
      }
      
      // Then check transfer input
      const transferHandled = await handleTransferInput(ctx, server);
      if (!transferHandled) {
        await next();
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes("not in transfer mode")) {
        console.error("Error in wallet text handler:", error);
      }
      await next();
    }
  });
}
