import { Telegraf, Scenes, session } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import Decimal from "decimal.js";
import { BotContext } from "@/types/bot.types";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { messageHandler } from "./handlers";
import { registerGlobalCallbacks } from "./handlers/global-callbacks";
import { positionDetailScene } from "./scenes";
import { poolDetailScene } from "./scenes/pool-detail.scene";
import { createPositionScene } from "./scenes";
import { logger } from "@/utils/logger";

// Configure high precision for financial calculations
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_DOWN,
  toExpNeg: -18,
  toExpPos: 18,
});

export async function setupBotCommands(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  setupMiddleware(bot, server);

  const stage = new Scenes.Stage<any>(
    [positionDetailScene, createPositionScene, poolDetailScene],
    { ttl: 600 }
  );

  bot.use(session());
  bot.use(stage.middleware());

  bot.on(message("text"), messageHandler);

  registerGlobalCallbacks(bot, server);
  registerCommands(bot, server);

  bot.catch((err, ctx) => {
    const { errorHandler } = require("@/shared/errors/error-handler");
    const result = errorHandler.handle(err, { updateType: ctx.updateType });
    if (result.logLevel === "error") logger.error(err, `Bot error for ${ctx.updateType}:`);
    else if (result.logLevel === "warn") logger.warn(err, `Bot warning for ${ctx.updateType}:`);
    else if (result.logLevel === "info") logger.info({ err }, `Bot info for ${ctx.updateType}:`);
    ctx.reply(result.userMessage);
  });
}
