import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler } from "../handlers";

export function walletCommand(bot: Telegraf, _server: FastifyInstance) {
  // Handle /wallet command
  bot.command("wallet", (ctx) => walletHandler(ctx, _server));
  
  // Handle wallet button callback from main menu
  bot.action("wallet", (ctx) => walletHandler(ctx, _server));
}
