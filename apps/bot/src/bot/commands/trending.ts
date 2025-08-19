import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { handleTrendingCallback, trendingHandler } from "../handlers/trending";

export function trendingCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("trending", (ctx: Context) =>
    trendingHandler(ctx as any, server)
  );
  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (ctx) => {
    return handleTrendingCallback(ctx, server);
  });
}
