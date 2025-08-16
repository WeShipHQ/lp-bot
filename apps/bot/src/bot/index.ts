import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";

export async function setupBotCommands(bot: Telegraf, server: FastifyInstance) {
  // Setup middleware
  setupMiddleware(bot, server);

  bot.on("inline_query", async (ctx) => {
    console.log("inline_query", ctx);
  });

  // Register commands
  registerCommands(bot, server);

  // Global error handler
  bot.catch((err, ctx) => {
    server.log.error(`Bot error for ${ctx.updateType}:`, err);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
