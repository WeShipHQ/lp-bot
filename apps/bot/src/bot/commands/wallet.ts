import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler } from "../handlers";

export function walletCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.command("wallet", (ctx) => walletHandler(ctx, _server));
}
