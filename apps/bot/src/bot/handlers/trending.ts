import { FastifyInstance } from "fastify";
import {
  TRENDING_CONSTANTS,
  TRENDING_MESSAGES,
} from "../constants/trending.constants";
import { trendingService } from "@/services/trending.service";
import {
  getSarosTrendingKeyboard,
  getTrendingKeyboard,
} from "../keyboards/trending-menu";
import { buildPoolDetailMarkdown } from "@/services/pool-detail.service";
import { BotContext } from "@/types/bot.types";
import { SELECTED_DEX } from "../config/constants";
import { PoolsFormatter } from "../utils/messages/pool.formatter";
import { MessageManager } from "../utils/messages";
import { TrendingPoolsSortCriteria, unifiedPoolService } from "@/v2";

export async function trendingHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    const loading = await ctx.reply(TRENDING_MESSAGES.FETCHING);

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
      reply_markup: getSarosTrendingKeyboard(
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
  console.log("handleTrendingCallback");
  if (SELECTED_DEX === "saros") {
    return handleSarosTrendingCallback(ctx, _server);
  }
  try {
    const raw = String(ctx.callbackQuery?.data ?? ctx.match?.input ?? "");

    const paginationMatch = /^tr_(prev|next|refresh)_(\d+)$/.exec(raw);
    const sortMatch = /^tr_sort_(apy|tvl|volume24h|fee_tvl_ratio)_(\d+)$/.exec(
      raw
    );
    const openMatch = /^tr_open_(\d+)_(\d+)$/.exec(raw);

    let action: "prev" | "next" | "refresh" | "sort" | "open";
    let chatIdStr = "";
    let sortBy: "apy" | "tvl" | "volume24h" | "fee_tvl_ratio" | undefined;
    let openIndex: number | undefined;

    if (paginationMatch) {
      action = paginationMatch[1] as "prev" | "next" | "refresh";
      chatIdStr = paginationMatch[2];
    } else if (sortMatch) {
      action = "sort";
      sortBy = sortMatch[1] as "apy" | "tvl" | "volume24h" | "fee_tvl_ratio";
      chatIdStr = sortMatch[2];
    } else if (openMatch) {
      action = "open";
      openIndex = Number(openMatch[1]);
      chatIdStr = openMatch[2];
    } else {
      await ctx.answerCbQuery("❌ Invalid callback data.");
      return;
    }

    if (!chatIdStr) {
      await ctx.answerCbQuery("❌ Invalid callback data format.");
      return;
    }

    const chatId = Number(chatIdStr);
    if (isNaN(chatId)) {
      await ctx.answerCbQuery("❌ Invalid chat ID.");
      return;
    }

    if (chatId !== ctx.chat!.id) {
      await ctx.answerCbQuery("❌ This button is not for you.", {
        show_alert: false,
      });
      return;
    }

    if (action === "open") {
      await ctx.answerCbQuery();
      const st = trendingService.getState(chatId);
      if (
        !st ||
        !st.poolItems ||
        openIndex == null ||
        openIndex < 0 ||
        openIndex >= st.poolItems.length
      ) {
        await ctx.reply("❌ Pool not found.");
        return;
      }
      const baseItem = st.poolItems[openIndex];
      const md = await buildPoolDetailMarkdown(st.poolSource!, baseItem);
      await ctx.reply(md, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
      return;
    }

    let currentState = trendingService.getState(chatId);
    if (!currentState) {
      await trendingService.loadHotPoolsPage(chatId, 0, "tvl");
      currentState = trendingService.getState(chatId)!;
    }

    const beforeApi = currentState.apiPage ?? 0;
    const currentSort: "apy" | "tvl" | "volume24h" | "fee_tvl_ratio" =
      sortBy || currentState.sortBy || "tvl";
    const currentSource: "dlmm" | "dammv1" | "dammv2" =
      currentState.poolSource || "dlmm";

    if (action === "next") {
      const nextPage = Math.min((beforeApi ?? 0) + 1, 4);
      if (nextPage === beforeApi) {
        await ctx.answerCbQuery("Already at last page");
        return;
      }
      await trendingService.loadHotPoolsPage(
        chatId,
        nextPage,
        currentSort,
        currentSource
      );
      await ctx.answerCbQuery();
    } else if (action === "prev") {
      const prevPage = Math.max((beforeApi ?? 0) - 1, 0);
      if (prevPage === beforeApi) {
        await ctx.answerCbQuery("Already at first page");
        return;
      }
      await trendingService.loadHotPoolsPage(
        chatId,
        prevPage,
        currentSort,
        currentSource
      );
      await ctx.answerCbQuery();
    } else if (action === "refresh") {
      await trendingService.loadHotPoolsPage(
        chatId,
        beforeApi,
        currentSort,
        currentSource
      );
      await ctx.answerCbQuery("Refreshed");
    } else if (action === "sort" && sortBy) {
      await trendingService.loadHotPoolsPage(chatId, 0, sortBy, "dlmm");
      await ctx.answerCbQuery(
        `Sorting by: ${sortBy === "fee_tvl_ratio" ? "Fee/TVL" : sortBy === "volume24h" ? "24h Vol" : sortBy.toUpperCase()}`
      );
    }

    const state = trendingService.getState(chatId)!;

    const text = trendingService.formatPoolPage(
      state.poolItems || [],
      state.page,
      state.poolSource!,
      state.sortBy!
    );

    const keyboard = getTrendingKeyboard(
      chatId,
      state.sortBy!,
      state.poolSource!
    );

    const messageId = state.messageId ?? ctx.callbackQuery?.message?.message_id;

    let edited = false;
    if (messageId) {
      try {
        await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: true },
          reply_markup: keyboard.reply_markup,
        });
        edited = true;
      } catch (err: any) {
        const msg = err?.description || err?.message || String(err);
        if (/message is not modified/i.test(msg)) edited = true;
      }
    }

    if (!edited) {
      const replyResponse = await ctx.reply(text, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard.reply_markup,
      });
      trendingService.setMessageId(chatId, replyResponse.message_id);
    }
  } catch (e) {
    console.error("[Trending] Error:", e);
    await ctx.answerCbQuery("❌ Error occurred.");
  }
}

export async function handleSarosTrendingCallback(
  ctx: any,
  _server: FastifyInstance
) {
  console.log(
    "handleTrendingCallback saros",
    ctx.callbackQuery?.data ?? ctx.match?.input ?? ""
  );
  try {
    const raw = String(ctx.callbackQuery?.data ?? ctx.match?.input ?? "");

    const sarosMatch = /^(trend|refresh|noop):(\d+):(\w+)$/.exec(raw);

    if (sarosMatch) {
      const [, action, pageStr, sortBy] = sarosMatch;
      const page = Number(pageStr);

      if (action === "noop") {
        await ctx.answerCbQuery();
        return;
      }

      const validSortCriteria: TrendingPoolsSortCriteria[] = [
        "apy",
        "tvl",
        "volume24h",
        "fee_tvl_ratio",
      ];
      if (!validSortCriteria.includes(sortBy as TrendingPoolsSortCriteria)) {
        await ctx.answerCbQuery("❌ Invalid sort criteria.");
        return;
      }

      try {
        if (action !== "trend" && action !== "refresh") {
          await ctx.answerCbQuery("❌ Invalid action.");
          return;
        }

        const poolsResponse = await unifiedPoolService.getTrendingPools(
          SELECTED_DEX,
          {
            page: page,
            limit: TRENDING_CONSTANTS.PAGE_SIZE,
            sortBy: sortBy as TrendingPoolsSortCriteria,
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

        const keyboard = getSarosTrendingKeyboard(
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
        } else if (action === "trend") {
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
        console.error("[Trending] Error handling Saros callback:", error);
        await ctx.answerCbQuery("❌ Error occurred while fetching data.");
      }

      return;
    }

    await ctx.answerCbQuery("❌ Invalid callback data.");
    return;
  } catch (error) {
    console.error("[Trending] Error:", error);
    await ctx.answerCbQuery(MessageManager.getErrorMessage());
  }
}
