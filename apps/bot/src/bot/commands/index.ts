import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { startCommand } from "./start";
import { helpCommand } from "./help";
import { portfolioCommand } from "./portfolio";
import { walletCommand } from "./wallet";

export function registerCommands(bot: Telegraf, server: FastifyInstance) {
  startCommand(bot, server);
  helpCommand(bot, server);
  portfolioCommand(bot, server);
  walletCommand(bot, server);
}
