import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler, handleWalletCallback } from "../handlers";
import { BotContext } from "@/types/bot.types";

export function walletCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("wallet", (ctx) => walletHandler(ctx, server));
  
  bot.action(/^transfer_all_sol|transfer_x_sol|transfer_all_tokens|transfer_x_tokens|export_private_key|close_wallet|refresh_wallet$/, (ctx) => handleWalletCallback(ctx, server));
}
