import { FastifyInstance } from "fastify";
import {
  TRENDING_CONSTANTS,
  TRENDING_MESSAGES,
} from "../constants/trending.constants";
import { BotContext } from "@/types/bot.types";
// import { TrendingPoolsSortCriteria } from "@/v2";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { GetTrendingPoolsUseCase } from "@/application/trending/get-trending-pools.use-case";
import { PoolFormatter } from "../formatters/pool.formatter";
import { MessageService } from "@/application/message/message.service";
import { createTextMessage } from "../formatters/message-builder";
import { TrendingPoolsSortCriteria } from "@/types/core.types";

export async function trendingHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const messageService = container.get<MessageService>(
    DI_TOKENS.MessageService
  );

  let placeholderMessageId: number | undefined;

  try {
    const placeholder = await messageService.send({
      context: { chatId },
      payload: createTextMessage(
        "trending.fetching",
        TRENDING_MESSAGES.FETCHING
      ),
    });
    placeholderMessageId = placeholder.messageId;

    const sortBy: TrendingPoolsSortCriteria = "apy";
    const useCase = container.get(GetTrendingPoolsUseCase);
    const poolsResponse = await useCase.execute({
      dex: "meteora",
      page: 1,
      limit: TRENDING_CONSTANTS.PAGE_SIZE,
      sortBy,
    });

    const payload = PoolFormatter.createTrendingPoolsPayload(
      poolsResponse.pools,
      poolsResponse.sortBy,
      poolsResponse.currentPage,
      poolsResponse.totalPages
    );

    await messageService.edit({
      context: {
        chatId,
        messageId: placeholder.messageId,
      },
      payload,
    });
  } catch (error) {
    console.error("[Trending] Error in handler:", error);
    const fallbackPayload = createTextMessage(
      "trending.error",
      TRENDING_MESSAGES.ERROR_GENERIC,
      { disableLinkPreview: true }
    );

    if (placeholderMessageId) {
      await messageService.edit({
        context: { chatId, messageId: placeholderMessageId },
        payload: fallbackPayload,
      });
    } else {
      await messageService.send({
        context: { chatId },
        payload: fallbackPayload,
      });
    }
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

    const [, action, pageStr, sortByStr] = match as unknown as [
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

    const useCase = container.get(GetTrendingPoolsUseCase);
    const poolsResponse = await useCase.execute({
      dex: "all",
      page: nextPage,
      limit: TRENDING_CONSTANTS.PAGE_SIZE,
      sortBy,
    });

    const payload = PoolFormatter.createTrendingPoolsPayload(
      poolsResponse.pools,
      poolsResponse.sortBy,
      poolsResponse.currentPage,
      poolsResponse.totalPages
    );

    const chatId = ctx.chat?.id;
    const messageId = ctx.callbackQuery?.message?.message_id;
    const messageService = container.get<MessageService>(
      DI_TOKENS.MessageService
    );

    let edited = false;
    if (chatId && messageId) {
      try {
        await messageService.edit({
          context: { chatId, messageId },
          payload,
        });
        edited = true;
      } catch (err: any) {
        const msg = err?.description || err?.message || String(err);
        if (/message is not modified/i.test(msg)) {
          edited = true;
        }
      }
    }

    if (!edited && chatId) {
      await messageService.send({
        context: { chatId },
        payload,
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
  } catch (error: any) {
    console.error("[Trending] Error:", error);
    await ctx.answerCbQuery(error?.message || "❌ Error");
  }
}
