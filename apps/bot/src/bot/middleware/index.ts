import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "./auth";
import { loggingMiddleware } from "./logging";
import { BotContext } from "@/types/bot.types";

export function setupMiddleware(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.use(loggingMiddleware(server));
  bot.use(authMiddleware(server));
}
