import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { startCommand } from "./start";
import { helpCommand } from "./help";
import { portfolioCommand } from "./portfolio";
import { walletCommand } from "./wallet";
import { trendingCommand } from "./trending";
import { BotContext } from "@/types/bot.types";

export function registerCommands(bot: Telegraf<BotContext>, server: FastifyInstance) {
  trendingCommand(bot, server);
  startCommand(bot, server);
  helpCommand(bot, server);
  portfolioCommand(bot, server);
  walletCommand(bot, server);
}
