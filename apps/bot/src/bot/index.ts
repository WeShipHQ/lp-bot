import { Telegraf, Scenes, session } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import Decimal from "decimal.js";
import { setupMiddleware } from "./middleware";
import { registerCommands } from "./commands";
import { messageHandler } from "./handlers";
import { BotContext } from "@/types/bot.types";
import { logger } from "@/utils/logger";
import { positionDetailScene } from "./scenes";
import { poolDetailScene } from "./scenes/pool-detail.scene";
import { createPositionScene } from "./scenes";

Decimal.set({
  precision: 28,           // High precision for financial calculations
  rounding: Decimal.ROUND_DOWN,  // Conservative rounding for financial apps
  toExpNeg: -18,          // Avoid scientific notation for small numbers
  toExpPos: 18            // Avoid scientific notation for large numbers
});

export async function setupBotCommands(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  setupMiddleware(bot, server);

  const stage = new Scenes.Stage<any>(
    [
      positionDetailScene,
      createPositionScene,
      poolDetailScene,
      // inputMessageScene,
      // strategySelectionScene,
      // sideSelectionScene,
      // amountInputScene,
      // customAmountScene,
      // confirmationScene,
      // positionPreviewScene,
    ],
    {
      ttl: 600, // 10 minutes
    }
  );

  bot.use(session());
  bot.use(stage.middleware());

  bot.on(message("text"), messageHandler);

  registerCommands(bot, server);

  // Global error handler
  bot.catch((err, ctx) => {
    logger.error(err, `Bot error for ${ctx.updateType}:`);
    ctx.reply("Sorry, something went wrong. Please try again later.");
  });
}
