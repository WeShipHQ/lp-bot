import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import {
  portfolioHandler,
  registerPortfolioCallbacks,
} from "../handlers/portfolio";
import { BotContext } from "@/types/bot.types";

export function portfolioCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("portfolio", (ctx) => portfolioHandler(ctx, server));
  registerPortfolioCallbacks(bot);
}
