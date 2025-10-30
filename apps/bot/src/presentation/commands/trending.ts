import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { handleTrendingCallback, trendingHandler } from "../handlers/trending";

export function trendingCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("trending", async (context: Context) => {
    try {
      return trendingHandler(context as any, server);
    } catch (e) {
      console.error('[Trending] Error in command handler:', e);
      return trendingHandler(context as any, server);
    }
  });

  // Standardized callback data pattern for trending feature
  bot.action(/^trending:(prev|next|refresh|sort|noop):\d+:(apy|tvl|volume24h|fee_tvl_ratio)$/,
    (context) => handleTrendingCallback(context, server)
  );
}
