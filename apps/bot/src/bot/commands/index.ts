import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { startCommand } from "./start";
import { helpCommand } from "./help";
import { portfolioCommand } from "./portfolio";
import { walletCommand } from "./wallet";
import { BotContext } from "@/types/bot.types";
import { trendingCommand } from "./trending";
import { twoFactorAuthCommand } from "./two-factor-auth";

export function registerCommands(bot: Telegraf<BotContext>, server: FastifyInstance) {
  startCommand(bot, server);
  helpCommand(bot, server);
  portfolioCommand(bot, server);
  walletCommand(bot, server);
  trendingCommand(bot, server);
  twoFactorAuthCommand(bot, server);
}
