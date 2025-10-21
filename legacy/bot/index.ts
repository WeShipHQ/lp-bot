import { Telegraf, Scenes, session } from "telegraf";
import { message } from "telegraf/filters";
import { FastifyInstance } from "fastify";
import Decimal from "decimal.js";
// import { setupMiddleware } from "./middleware";
// import { registerCommands } from "./commands";
// import { messageHandler } from "./handlers";
import { BotContext } from "@/types/bot.types";
import { logger } from "@/utils/logger";
// import { positionDetailScene } from "./scenes";
// import { poolDetailScene } from "./scenes/pool-detail.scene";
// import { createPositionScene } from "./scenes";
// import { registerGlobalCallbacks } from "./handlers/global-callbacks";
import { dexRegistry } from "@/services/dex-registry.service";
import { SarosAdapter } from "@/services/saros/saros.adapter";
import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";

Decimal.set({
  precision: 28, // High precision for financial calculations
  rounding: Decimal.ROUND_DOWN, // Conservative rounding for financial apps
  toExpNeg: -18, // Avoid scientific notation for small numbers
  toExpPos: 18, // Avoid scientific notation for large numbers
});

export function initializeV2Architecture(): void {
  console.log("Initializing v2 multi-DEX architecture...");

  dexRegistry.register(new MeteoraAdapter());
  dexRegistry.register(new SarosAdapter());

  console.log(
    `Registered ${dexRegistry.getSupportedDexes().length} DEX adapters:`,
    dexRegistry.getSupportedDexes()
  );
}

initializeV2Architecture();

export async function setupBotCommands(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  // setupMiddleware(bot, server);

  // const stage = new Scenes.Stage<any>(
  //   [
  //     positionDetailScene,
  //     createPositionScene,
  //     poolDetailScene,
  //     // inputMessageScene,
  //     // strategySelectionScene,
  //     // sideSelectionScene,
  //     // amountInputScene,
  //     // customAmountScene,
  //     // confirmationScene,
  //     // positionPreviewScene,
  //   ],
  //   {
  //     ttl: 600, // 10 minutes
  //   }
  // );

  // bot.use(session());
  // bot.use(stage.middleware());

  // bot.on(message("text"), messageHandler);

  // registerGlobalCallbacks(bot, server);
  // registerCommands(bot, server);

  bot.catch((err, ctx) => {
    const { errorHandler } = require("@/shared/errors/error-handler");
    const result = errorHandler.handle(err, { updateType: ctx.updateType });
    if (result.logLevel === "error")
      logger.error(err, `Bot error for ${ctx.updateType}:`);
    else if (result.logLevel === "warn")
      logger.warn(err, `Bot warning for ${ctx.updateType}:`);
    else if (result.logLevel === "info")
      logger.info({ err }, `Bot info for ${ctx.updateType}:`);
    ctx.reply(result.userMessage);
  });
}
