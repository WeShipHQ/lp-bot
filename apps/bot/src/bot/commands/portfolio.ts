import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { portfolioHandler } from "../handlers";
import { BotContext } from "@/types/bot.types";

export function portfolioCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("portfolio", (ctx) => portfolioHandler(ctx, _server));
}
