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
  bot.command("trending", (ctx: Context) =>
    trendingHandler(ctx as any, server)
  );

  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (ctx) =>
    handleTrendingCallback(ctx, server)
  );

  // bot.action(/^tr_sort_(apy|fee24h|fee_tvl_ratio)_[0-9]+$/, (ctx) => {
  //   return handleTrendingCallback(ctx, server);
  // });

  bot.action(/^tr_src_(dlmm|dammv1|dammv2)_[0-9]+$/, (ctx) =>
    handleTrendingCallback(ctx, server)
  );

  bot.hears(/^\/([1-5])(?:@[A-Za-z0-9_]+)?$/, async (ctx) => {
    try {
      const m = ctx.message?.text?.match(/^\/([1-5])(?:@[A-Za-z0-9_]+)?$/);
      if (!m) return;

      const idx0 = Number(m[1]) - 1;
      const chatId = ctx.chat!.id;

      const st = trendingService.getState(chatId);
      if (!st || !st.poolItems?.[idx0]) {
        await ctx.reply("❌ Pool not found or list expired. Try /trending.");
        return;
      }

      const baseItem = st.poolItems[idx0];
      const md = await buildPoolDetailMarkdown(st.poolSource!, baseItem);

      await ctx.reply(md, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.reply("❌ Error.");
    }
  });
}
