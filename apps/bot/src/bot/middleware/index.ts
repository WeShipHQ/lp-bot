import { Telegraf, session } from "telegraf";
import { FastifyInstance } from "fastify";
import { authMiddleware } from "./auth";
import { loggingMiddleware } from "./logging";
import { BotContext } from "@/types/bot.types";

export function setupMiddleware(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  // Enable session middleware for state management
  bot.use(session());
  
  // Add logging and auth middleware
  bot.use(loggingMiddleware(server));
  bot.use(authMiddleware(server));
}
