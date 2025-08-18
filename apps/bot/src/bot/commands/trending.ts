import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { trendingHandler, handleTrendingCallback } from "../handlers/trending";

export function trendingCommand(bot: Telegraf, server: FastifyInstance) {
  bot.command("trending", (ctx: Context) =>
    trendingHandler(ctx as any, server)
  );
  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (ctx) => {
    return handleTrendingCallback(ctx, server);
  });
}
