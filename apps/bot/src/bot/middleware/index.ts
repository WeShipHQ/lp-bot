import { Telegraf} from "telegraf";
import { FastifyInstance } from "fastify";
import { loggingMiddleware } from "./logging";

export function setupMiddleware(bot: Telegraf, server: FastifyInstance) {
  // Logging middleware
  bot.use(loggingMiddleware(server));
}