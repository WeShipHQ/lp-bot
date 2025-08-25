import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { handleTrendingCallback, trendingHandler } from "../handlers/trending";
import { trendingService } from "@/services/trending.service";
import { buildPoolDetailMarkdown } from "@/services/pool-detail.service";

export function trendingCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("trending", (context: Context) =>
    trendingHandler(context as any, server)
  );

  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (context) =>
    handleTrendingCallback(context, server)
  );

  // bot.action(/^tr_sort_(apy|fee24h|fee_tvl_ratio)_[0-9]+$/, (context) => {
  //   return handleTrendingCallback(context, server);
  // });

  bot.action(/^tr_src_(dlmm|dammv1|dammv2)_[0-9]+$/, (context) =>
    handleTrendingCallback(context, server)
  );

  bot.hears(/^\/([1-5])(?:@[A-Za-z0-9_]+)?$/, async (context) => {
    try {
      const match = context.message?.text?.match(
        /^\/([1-5])(?:@[A-Za-z0-9_]+)?$/
      );
      if (!match) return;

      const poolIndex = Number(match[1]) - 1;
      const chatId = context.chat!.id;

      const trendingState = trendingService.getState(chatId);
      if (!trendingState || !trendingState.poolItems?.[poolIndex]) {
        await context.reply(
          "❌ Pool not found or list expired. Try /trending."
        );
        return;
      }

      const selectedPoolItem = trendingState.poolItems[poolIndex];
      const detailMarkdown = await buildPoolDetailMarkdown(
        trendingState.poolSource!,
        selectedPoolItem
      );

      await context.reply(detailMarkdown, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await context.reply("❌ Error.");
    }
  });
}
