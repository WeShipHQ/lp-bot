import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { handleTokenInput } from "./handlers";
import { BotContext } from "@/types/bot.types";

export async function setupBotCommands(bot: Telegraf<BotContext>, server: FastifyInstance) {
  // Setup middleware
  setupMiddleware(bot, server);

  // Register commands
  registerCommands(bot, server);

  bot.on("inline_query", async (ctx) => {
    console.log("inline_query", ctx);
  });

  bot.on(message("text"), async (ctx) => {
    try {
      await handleTokenInput(ctx, server);
    } catch (error) {
      server.log.error("Error in text handler:", error);
    }
  });

  // Global error handler
  bot.catch((err, ctx) => {
    server.log.error(`Bot error for ${ctx.updateType}:`, err);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
