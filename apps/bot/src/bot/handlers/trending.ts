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

    await trendingService.loadApiPage(chatId, 0);

    const state = trendingService.getState(chatId)!;
    const text = trendingService.formatPage(state.items, state.page);
    const keyboard = getTrendingKeyboard(chatId);

    const replyResponse = await ctx.reply(text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true },
      reply_markup: keyboard.reply_markup,
    });

    trendingService.setMessageId(chatId, replyResponse.message_id);

    await ctx.telegram.deleteMessage(chatId, loading.message_id);
  } catch {
    await ctx.reply(TRENDING_MESSAGES.ERROR_GENERIC);
  }
}

export async function handleTrendingCallback(
  ctx: any,
  _server: FastifyInstance
) {
  try {
    const raw = String(ctx.callbackQuery?.data ?? ctx.match?.input ?? "");

    const match = /^tr_(prev|next|refresh)_(\d+)$/.exec(raw);
    if (!match) {
      await ctx.answerCbQuery("❌ Invalid callback data.");
      return;
    }
    const [, action, chatIdStr] = match;

    if (!action || !chatIdStr) {
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

    // check state exists
    let currentState = trendingService.getState(chatId);
    if (!currentState) {
      await trendingService.loadApiPage(chatId, 0);
      currentState = trendingService.getState(chatId)!;
    }

    const beforeApi = currentState.apiPage ?? 0;

    if (action === "next") {
      await trendingService.loadApiPage(chatId, beforeApi + 1);
    } else if (action === "prev") {
      if (beforeApi > 0) {
        await trendingService.loadApiPage(chatId, beforeApi - 1);
      } else {
        await ctx.answerCbQuery("Already at first page");
        return;
      }
    } else if (action === "refresh") {
      await trendingService.loadApiPage(chatId, beforeApi);
    }

    const state = trendingService.getState(chatId)!;
    const text = trendingService.formatPage(state.items, state.page);
    const keyboard = getTrendingKeyboard(chatId);
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
