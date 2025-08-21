import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { handleTokenInput } from "./handlers";
import { BotContext } from "@/types/bot.types";
import {
  handlePositionCallback,
  handlePoolSelection,
  handlePositionCreation,
} from "./handlers";

export async function setupBotCommands(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
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

  // Register callback query handlers
  bot.action(
    /^position_(token|pool)_[1-9A-HJ-NP-Za-km-z]{32,44}_(damm_v1|damm_v2|dlmm)?$/,
    (ctx) => {
      console.log("handlePositionCallback", ctx.callbackQuery);
      return handlePositionCallback(ctx, server);
    }
  );

  bot.action(/^select-pool_[1-9A-HJ-NP-Za-km-z]{32,44}$/, (ctx) => {
    console.log("handlePoolSelection", ctx.callbackQuery);
    return handlePoolSelection(ctx, server);
  });

  bot.action(
    /^create-position_(spot|curve|single)_[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    (ctx) => {
      console.log("handlePositionCreation", ctx.callbackQuery);
      return handlePositionCreation(ctx, server);
    }
  );

  // Global error handler
  bot.catch((err, ctx) => {
    server.log.error(`Bot error for ${ctx.updateType}:`, err);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
