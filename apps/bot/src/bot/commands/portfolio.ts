import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { portfolioHandler } from "../handlers";

export function portfolioCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.command("portfolio", (ctx) => portfolioHandler(ctx, _server));
}
