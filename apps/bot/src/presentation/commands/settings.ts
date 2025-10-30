import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import {
  settingsHandler,
  handleSettingsCallback,
  handleSettingsInput,
} from "../handlers/settings";
import { ST_PATTERNS } from "../constants/settings.constants";
import { message } from "telegraf/filters";

export function settingsCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("settings", (ctx) => settingsHandler(ctx, server));

  // Combine patterns for a single action handler
  const combined = new RegExp(
    [
      ST_PATTERNS.refresh.source,
      ST_PATTERNS.scheduleSet.source,

      // New settings patterns
      ST_PATTERNS.toggleRebalance.source,
      ST_PATTERNS.rebalanceThreshold.source,
      ST_PATTERNS.binRange.source,
      ST_PATTERNS.stopLoss.source,
      ST_PATTERNS.takeProfit.source,
      ST_PATTERNS.toggleAutoConvert.source,
      ST_PATTERNS.slippage.source,

      // Menu navigation patterns
      "schedule_menu",
      "threshold_menu",
      "bin_menu",
      "sl_menu",
      "tp_menu",
      "slippage_menu",
      "back_to_main",
    ].join("|")
  );

  bot.action(combined, (ctx) => handleSettingsCallback(ctx, server));

  // Handle interactive text inputs for settings
  bot.on(message("text"), async (ctx, next) => {
    const handled = await handleSettingsInput(ctx, server);
    if (!handled) return next();
  });
}
