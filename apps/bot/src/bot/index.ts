import { Telegraf, session } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { messageHandler, createTradingStage } from "./handlers";
import { BotContext } from "@/types/bot.types";
import {
  handlePositionCallback,
  handlePoolSelection,
  handlePositionCreation,
} from "./handlers";
import { logger } from "@/utils/logger";

// import { createTradingStage, handleDirectMessage } from "./screne";

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

  const stage = createTradingStage();
  // bot.use(session());
  bot.use(stage.middleware());

  bot.on(message("text"), async (ctx) => {
    try {
      await messageHandler(ctx, server);
    } catch (error) {
      logger.error(error, "Error in text handler:");
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
    logger.error(err, `Bot error for ${ctx.updateType}:`);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
