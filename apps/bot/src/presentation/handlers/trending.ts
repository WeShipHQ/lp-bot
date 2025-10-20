import { FastifyInstance } from "fastify";
import {
  TRENDING_CONSTANTS,
  TRENDING_MESSAGES,
} from "../constants/trending.constants";
import { BotContext } from "@/types/bot.types";
import { SELECTED_DEX } from "@/bot/config/constants";
import { PoolsFormatter } from "@/bot/utils/messages/pool.formatter";
import { MessageManager } from "@/bot/utils/messages";
import { TrendingPoolsSortCriteria, unifiedPoolService } from "@/v2";
import { getTrendingKeyboard } from "../keyboards/trending-menu";

export async function trendingHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    await ctx.reply(TRENDING_MESSAGES.FETCHING);

    const sortBy: TrendingPoolsSortCriteria = "apy";
    const poolsResponse = await unifiedPoolService.getTrendingPools(
      SELECTED_DEX,
      {
        page: 1,
        limit: TRENDING_CONSTANTS.PAGE_SIZE,
        sortBy,
        sortOrder: "desc",
        minTvl: 0,
        verified: true,
      }
    );

    const message = PoolsFormatter.formatTrendingPoolsMessage(
      poolsResponse.pools,
      poolsResponse.sortBy,
      poolsResponse.currentPage,
      poolsResponse.totalPages
    );

    return await ctx.reply(message, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
      reply_markup: getTrendingKeyboard(
        poolsResponse.currentPage,
        sortBy,
        poolsResponse.totalPages
      ),
    });
  } catch (error) {
    console.error("[Trending] Error in handler:", error);
    await ctx.reply(TRENDING_MESSAGES.ERROR_GENERIC);
  }
}

export async function handleTrendingCallback(
  ctx: any,
  _server: FastifyInstance
) {
  try {
    const raw = String(ctx.callbackQuery?.data ?? ctx.match?.input ?? "");
    const match =
      /^trending:(prev|next|refresh|sort|noop):(\d+):(apy|tvl|volume24h|fee_tvl_ratio)$/.exec(
        raw
      );

    if (!match) {
      await ctx.answerCbQuery("❌ Invalid callback data.");
      return;
    }

    // @ts-expect-error FIXME
    const [, action, pageStr, sortByStr] = match as [
      string,
      string,
      string,
      TrendingPoolsSortCriteria,
    ];
    const currentPage = Number(pageStr) || 1;
    const sortBy = sortByStr as TrendingPoolsSortCriteria;

    if (action === "noop") {
      await ctx.answerCbQuery();
      return;
    }

    let nextPage = currentPage;
    if (action === "prev") nextPage = Math.max(1, currentPage - 1);
    else if (action === "next") nextPage = currentPage + 1;
    else if (action === "sort") nextPage = 1;

    const poolsResponse = await unifiedPoolService.getTrendingPools(
      SELECTED_DEX,
      {
        page: nextPage,
        limit: TRENDING_CONSTANTS.PAGE_SIZE,
        sortBy,
        sortOrder: "desc",
        minTvl: 0,
        verified: true,
      }
    );

    const message = PoolsFormatter.formatTrendingPoolsMessage(
      poolsResponse.pools,
      poolsResponse.sortBy,
      poolsResponse.currentPage,
      poolsResponse.totalPages
    );

    const keyboard = getTrendingKeyboard(
      poolsResponse.currentPage,
      poolsResponse.sortBy,
      poolsResponse.totalPages
    );

    const messageId = ctx.callbackQuery?.message?.message_id;
    let edited = false;

    if (messageId) {
      try {
        await ctx.telegram.editMessageText(
          ctx.chat!.id,
          messageId,
          undefined,
          message,
          {
            parse_mode: "Markdown",
            link_preview_options: { is_disabled: true },
            reply_markup: keyboard,
          }
        );
        edited = true;
      } catch (err: any) {
        const msg = err?.description || err?.message || String(err);
        if (/message is not modified/i.test(msg)) {
          edited = true;
        }
      }
    }

    if (!edited) {
      await ctx.reply(message, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      });
    }

    if (action === "refresh") {
      await ctx.answerCbQuery("🔄 Refreshed");
    } else if (action === "sort") {
      const sortDisplayName =
        sortBy === "fee_tvl_ratio"
          ? "Fee/TVL"
          : sortBy === "volume24h"
            ? "24h Vol"
            : sortBy.toUpperCase();
      await ctx.answerCbQuery(`Sorted by: ${sortDisplayName}`);
    } else {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    console.error("[Trending] Error:", error);
    await ctx.answerCbQuery(MessageManager.getErrorMessage());
  }
}
