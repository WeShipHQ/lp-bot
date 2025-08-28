import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { Telegraf } from "telegraf";
import { helpCommand } from "./help";
import { portfolioCommand } from "./portfolio";
import { startCommand } from "./start";
import { trendingCommand } from "./trending";
import { walletCommand } from "./wallet";
import { generateImageCommand } from "./genarate-images";


export function registerCommands(bot: Telegraf<BotContext>, server: FastifyInstance) {
  startCommand(bot, server);
  helpCommand(bot, server);
  portfolioCommand(bot, server);
  walletCommand(bot, server);
  trendingCommand(bot, server);
  generateImageCommand(bot);
}
