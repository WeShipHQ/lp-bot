import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "./auth";
import { loggingMiddleware } from "./logging";

export function setupMiddleware(bot: Telegraf, server: FastifyInstance) {
  bot.use(loggingMiddleware(server));
  bot.use(authMiddleware(server));
}
