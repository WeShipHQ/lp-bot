import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { handleTrendingCallback, trendingHandler } from "../handlers/trending";
import { trendingService } from "@/services/trending.service";
import { buildPoolDetailMarkdown } from "@/services/pool-detail.service";
import { getTrendingDetailKeyboard } from "../keyboards/pool-detail";

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

  // Handle trending detail refresh
  bot.action(/^tr_refresh_detail_(\d+)_(\d+)_(dlmm|dammv1|dammv2)$/, async (context) => {
    try {
      const match = (context.callbackQuery as any)?.data?.match(/^tr_refresh_detail_(\d+)_(\d+)_(dlmm|dammv1|dammv2)$/);
      if (!match) return;

      const chatId = Number(match[1]);
      const poolIndex = Number(match[2]);
      const source = match[3] as "dlmm" | "dammv1" | "dammv2";

      if (chatId !== context.chat!.id) {
        await context.answerCbQuery("❌ This button is not for you.");
        return;
      }

      const trendingState = trendingService.getState(chatId);
      if (!trendingState || !trendingState.poolItems?.[poolIndex]) {
        await context.answerCbQuery("❌ Pool not found or list expired.");
        return;
      }

      const selectedPoolItem = trendingState.poolItems[poolIndex];
      const detailMarkdown = await buildPoolDetailMarkdown(source, selectedPoolItem);
      const keyboard = getTrendingDetailKeyboard(chatId, poolIndex, source);

      await context.editMessageText(detailMarkdown, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard.reply_markup,
      });

      await context.answerCbQuery("🔄 Refreshed");
    } catch (error) {
      console.error("Error refreshing trending detail:", error);
      await context.answerCbQuery("❌ Error occurred.");
    }
  });

  // Handle trending detail close
  bot.action(/^tr_close_detail_(\d+)_(\d+)_(dlmm|dammv1|dammv2)$/, async (context) => {
    try {
      const match = (context.callbackQuery as any)?.data?.match(/^tr_close_detail_(\d+)_(\d+)_(dlmm|dammv1|dammv2)$/);
      if (!match) return;

      const chatId = Number(match[1]);

      if (chatId !== context.chat!.id) {
        await context.answerCbQuery("❌ This button is not for you.");
        return;
      }

      await context.deleteMessage();
      await context.answerCbQuery("❌ Closed");
    } catch (error) {
      console.error("Error closing trending detail:", error);
      await context.answerCbQuery("❌ Error occurred.");
    }
  });

  bot.hears(/^\/t([1-5])(?:@[A-Za-z0-9_]+)?$/, async (context) => {
    try {
      const match = context.message?.text?.match(
        /^\/t([1-5])(?:@[A-Za-z0-9_]+)?$/
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

      const keyboard = getTrendingDetailKeyboard(
        chatId,
        poolIndex,
        trendingState.poolSource!
      );

      await context.reply(detailMarkdown, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard.reply_markup,
      });
    } catch {
      await context.reply("❌ Error.");
    }
  });
}
