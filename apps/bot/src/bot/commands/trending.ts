import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { trendingHandler, handleTrendingCallback } from "../handlers/trending";
import { BotContext } from "@/types/bot.types";

export function trendingCommand(bot: Telegraf<BotContext>, server: FastifyInstance) {
  bot.command("trending", (ctx: Context) =>
    trendingHandler(ctx as any, server)
  );
  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (ctx) => {
    return handleTrendingCallback(ctx, server);
  });
}
