import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "./auth";
import { loggingMiddleware } from "./logging";

export function setupMiddleware(bot: Telegraf, server: FastifyInstance) {
  // Logging middleware
  bot.use(loggingMiddleware(server));

  // Authentication middleware (for commands that need user registration)
  bot.use(authMiddleware(server));
}