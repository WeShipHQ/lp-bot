import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { TRENDING_MESSAGES } from "../constants/trending.constants";
import { trendingService } from "@/services/trending.service";
import { getTrendingKeyboard } from "../keyboards/trending-menu";

interface BotContext extends Context {
  userId?: string;
}

export async function trendingHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  try {
    const loading = await ctx.reply(TRENDING_MESSAGES.FETCHING);
    const chatId = ctx.chat!.id;

    await trendingService.loadHotPoolsPage(chatId, 0, "apy", "dlmm");

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

    const replyResponse = await ctx.reply(text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard.reply_markup,
    });

    trendingService.setMessageId(chatId, replyResponse.message_id);

    await ctx.telegram.deleteMessage(chatId, loading.message_id);
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

    const paginationMatch = /^tr_(prev|next|refresh)_(\d+)$/.exec(raw);
    // const sortMatch = /^tr_sort_(apy|fee24h|fee_tvl_ratio)_(\d+)$/.exec(raw);

    const sourceMatch = /^tr_src_(dlmm|dammv1|dammv2)_(\d+)$/.exec(raw);

    let action: string;
    let chatIdStr: string;
    // let sortBy: "apy" | "fee24h" | "fee_tvl_ratio" | undefined;
    let source: "dlmm" | "dammv1" | "dammv2" | undefined;

    if (paginationMatch) {
      action = paginationMatch[1] as "prev" | "next" | "refresh";
      chatIdStr = paginationMatch[2];
      // else if (sortMatch) {
      //   const [, sortCriteria, chatId] = sortMatch;
      //   sortBy = sortCriteria as "apy" | "fee24h" | "fee_tvl_ratio";
      //   chatIdStr = chatId;
      //   action = "sort";
    } else if (sourceMatch) {
      const [, src, chatId] = sourceMatch;
      source = src as "dlmm" | "dammv1" | "dammv2";
      chatIdStr = chatId;
      action = "source";
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

    let currentState = trendingService.getState(chatId);
    if (!currentState) {
      await trendingService.loadHotPoolsPage(chatId, 0, "apy", "dlmm");
      currentState = trendingService.getState(chatId)!;
    }

    const beforeApi = currentState.apiPage ?? 0;
    // const currentSort: "apy" | "fee24h" | "fee_tvl_ratio" =
    //   sortBy || currentState.sortBy || "apy";
    const currentSort: "apy" | "fee24h" | "fee_tvl_ratio" =
   currentState.sortBy || "apy";
    const currentSource: "dlmm" | "dammv1" | "dammv2" =
      source || currentState.poolSource || "dlmm";

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
    } else if (action === "refresh") {
      await trendingService.loadHotPoolsPage(
        chatId,
        beforeApi,
        currentSort,
        currentSource
      );
    }
    // else if (action === "sort" && sortBy) {
    //   await trendingService.loadHotPoolsPage(
    //     chatId,
    //     0,
    //     currentSort,
    //     currentSource
    //   );
    else if (action === "source" && source) {
      await trendingService.loadHotPoolsPage(
        chatId,
        0, 
        currentSort,  
        source
      );
      await ctx.answerCbQuery(
        `Sorted by ${currentSort === "fee_tvl_ratio" ? "Fee/TVL Ratio" : currentSort.toUpperCase()}`
      );
    } else if (action === "source" && source) {
      await trendingService.loadHotPoolsPage(
        chatId,
        0,
        currentSort,
        currentSource
      );
      await ctx.answerCbQuery(`Source: ${currentSource.toUpperCase()}`);
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

    await ctx.answerCbQuery();
  } catch {
    await ctx.answerCbQuery("❌ Error occurred.");
  }
}
