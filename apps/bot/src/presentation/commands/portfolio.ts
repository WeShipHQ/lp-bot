import { Telegraf } from "telegraf";
import {
  portfolioHandler,
  registerPortfolioCallbacks,
} from "../handlers/portfolio";
import { BotContext } from "@/types/bot.types";

export function portfolioCommand(bot: Telegraf<BotContext>) {
  bot.command("portfolio", (ctx) => portfolioHandler(ctx));
  registerPortfolioCallbacks(bot);
}
