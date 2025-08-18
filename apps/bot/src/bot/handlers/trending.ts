import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { trendingService } from "../../services/trending.service";
import { TRENDING_MESSAGES } from "../../constants/trending.constants";
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

    const st = trendingService.getState(chatId)!;
    const text = trendingService.formatPage(st.items, st.page);
    const kb = getTrendingKeyboard(chatId);

    const sent = await ctx.reply(text, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: true } as any,
      reply_markup: kb.reply_markup,
    } as any);

    trendingService.setMessageId(chatId, sent.message_id);

    try {
      await ctx.telegram.deleteMessage(chatId, loading.message_id);
    } catch {}
  } catch {
    await ctx.reply(TRENDING_MESSAGES.ERROR_GENERIC);
  }
}

export async function handleTrendingCallback(
  ctx: any,
  _server: FastifyInstance
) {
  try {
    const data =
      (ctx.callbackQuery?.data as string) || (ctx.match?.input as string);
    const [, action, chatIdStr] = data.split("_");
    const chatId = Number(chatIdStr);

    if (chatId !== ctx.chat!.id) {
      await ctx.answerCbQuery("❌ This button is not for you.", {
        show_alert: false,
      });
      return;
    }

    // check state exists
    let st = trendingService.getState(chatId);
    if (!st) {
      await trendingService.loadApiPage(chatId, 0);
      st = trendingService.getState(chatId)!;
    }

    const beforeApi = st.apiPage ?? 0;

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
    const kb = getTrendingKeyboard(chatId);
    const messageId = state.messageId ?? ctx.callbackQuery?.message?.message_id;

    let edited = false;
    if (messageId) {
      try {
        await ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
          parse_mode: "Markdown",
          disable_web_page_preview: true,
          reply_markup: kb.reply_markup,
        });
        edited = true;
      } catch (err: any) {
        const msg = err?.description || err?.message || String(err);
        if (/message is not modified/i.test(msg)) edited = true;
      }
    }

    if (!edited) {
      const sent = await ctx.reply(text, {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true } as any,
        reply_markup: kb.reply_markup,
      } as any);
      trendingService.setMessageId(chatId, sent.message_id);
    }

    await ctx.answerCbQuery();
  } catch {
    await ctx.answerCbQuery("❌ Error occurred.");
  }
}
