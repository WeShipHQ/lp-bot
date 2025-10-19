import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { handleTrendingCallback, trendingHandler } from "../handlers/trending";
import { trendingService } from "@/services/trending.service";
import { SCENE_IDS } from "../config/scenes";
import { SELECTED_DEX } from "@/bot/config/constants";
import { container } from "@/infrastructure/di/container";
import { GetTrendingPoolsUseCase } from "@/application/trending/get-trending-pools.use-case";

export function trendingCommand(
  bot: Telegraf<BotContext>,
  server: FastifyInstance
) {
  bot.command("trending", async (context: Context) => {
    try {
      const { PoolFormatter } = await import("../formatters/pool.formatter");
      const { getSarosTrendingKeyboard } = await import("../keyboards/trending-menu");
      const { TRENDING_CONSTANTS } = await import("../constants/trending.constants");
      const useCase = container.get(GetTrendingPoolsUseCase);
      const res = await useCase.execute({ dex: (SELECTED_DEX as any) || 'saros', page: 1, limit: TRENDING_CONSTANTS.PAGE_SIZE, sortBy: 'apy' });
      const message = PoolFormatter.formatTrendingList(
        res.pools as any,
        res.currentPage,
        res.totalPages,
        res.sortBy
      );
      await (context as any).reply(message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: getSarosTrendingKeyboard(res.currentPage, res.sortBy, res.totalPages),
      });
    } catch (e) {
      console.error('[Trending] Error in command handler:', e);
      return trendingHandler(context as any, server);
    }
  });

  bot.action(/^tr_(next|prev|refresh)_[0-9]+$/, (context) =>
    handleTrendingCallback(context, server)
  );

  bot.action(
    /^tr_sort_(apy|tvl|volume24h|fee_tvl_ratio)_[0-9]+$/,
    (context) => {
      return handleTrendingCallback(context, server);
    }
  );

  bot.action(
    /^(trend|refresh|noop):\d+:(apy|tvl|volume24h|fee_tvl_ratio)$/,
    (context) => handleTrendingCallback(context, server)
  );

  // Handle trending detail refresh
  bot.action(/^tr_refresh_detail_(\d+)_(\d+)_dlmm$/, async (context) => {
    try {
      const match = (context.callbackQuery as any)?.data?.match(
        /^tr_refresh_detail_(\d+)_(\d+)_dlmm$/
      );
      if (!match) return;

      const chatId = Number(match[1]);
      const poolIndex = Number(match[2]);
      const source = "dlmm";

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

      // Delete current message and enter pool detail scene
      await context.deleteMessage();
      await context.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
        poolAddress: selectedPoolItem.poolAddress,
      });

      await context.answerCbQuery("🔄 Refreshed");
    } catch (error) {
      console.error("Error refreshing trending detail:", error);
      await context.answerCbQuery("❌ Error occurred.");
    }
  });

  // Handle trending detail close
  bot.action(/^tr_close_detail_(\d+)_(\d+)_dlmm$/, async (context) => {
    try {
      const match = (context.callbackQuery as any)?.data?.match(
        /^tr_close_detail_(\d+)_(\d+)_dlmm$/
      );
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

  bot.hears(/^\/([1-5])([A-Z0-9]+)(?:@[A-Za-z0-9_]+)?$/, async (context) => {
    try {
      const match = context.message?.text?.match(
        /^\/([1-5])([A-Z0-9]+)(?:@[A-Za-z0-9_]+)?$/
      );
      if (!match) return;

      const poolIndex = Number(match[1]) - 1;
      const tokenPairCombined = match[2];
      const chatId = context.chat!.id;

      const trendingState = trendingService.getState(chatId);
      if (!trendingState || !trendingState.poolItems?.[poolIndex]) {
        await context.reply(
          "❌ Pool not found or list expired. Try /trending."
        );
        return;
      }

      const selectedPoolItem = trendingState.poolItems[poolIndex];

      // Verify the token pair matches to ensure correct pool selection
      const expectedTokenPairCombined = selectedPoolItem.tokenPair.replace(
        "/",
        ""
      );
      if (expectedTokenPairCombined !== tokenPairCombined) {
        await context.reply(
          "❌ Pool not found or list expired. Try /trending."
        );
        return;
      }

      // Navigate to pool detail scene with the pool address
      await context.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
        poolAddress: selectedPoolItem.poolAddress,
      });
    } catch {
      await context.reply("❌ Error.");
    }
  });
}
