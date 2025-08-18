import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { startCommand } from "./start";
import { helpCommand } from "./help";
import { portfolioCommand } from "./portfolio";
import { walletCommand } from "./wallet";
import { trendingCommand } from "./trending";

export function registerCommands(bot: Telegraf, server: FastifyInstance) {
  trendingCommand(bot, server);
  startCommand(bot, server);
  helpCommand(bot, server);
  portfolioCommand(bot, server);
  walletCommand(bot, server);
}
