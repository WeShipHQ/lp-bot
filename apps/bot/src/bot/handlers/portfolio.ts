import { FastifyBaseLogger, FastifyInstance } from "fastify";
import { Composer, Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { PortfolioData } from "@/types/portfolio.types";
import {
  getOverviewKeyboard,
  getPositionDetailKeyboard,
} from "../keyboards/portfolio-menu";
import { MessageService } from "@/services/message.service";
import { PortfolioService } from "@/services/portfolio.service";

interface TelegramError {
  response?: {
    description?: string;
    error_code?: number;
  };
}

const portfolioSessions = new Map<number, PortfolioData>();

const DISABLE_LINK_PREVIEW = {
  link_preview_options: { is_disabled: true as const },
} as const;

const PORTFOLIO_CALLBACK = {
  portfolio: { back: "portfolio:back", refresh: "portfolio:refresh" },
  position: {
    claim: (i: number) => `pos:claim:${i}`,
    rebalance: (i: number) => `pos:rebalance:${i}`,
  },
  ui: { close: "ui:close" },
} as const;

// Unified regex for all position actions
const POSITION_ACTION_REGEX = /^pos:(claim|rebalance):(\d+)$/;

// -------- Session helpers --------

function tryGetChatId(context: BotContext): number | undefined {
  return context.chat ? context.chat.id : undefined;
}

function getPortfolio(context: BotContext): PortfolioData | undefined {
  const chatId = tryGetChatId(context);
  if (chatId === undefined) return undefined;
  return portfolioSessions.get(chatId);
}

function setPortfolio(context: BotContext, portfolio: PortfolioData): void {
  const chatId = tryGetChatId(context);
  if (chatId === undefined) return;
  portfolioSessions.set(chatId, portfolio);
}

// -------- Error helpers --------

// Classify Telegram errors that are safe to ignore for delete/edit/answer operations.
function isIgnorableTelegramError(err: unknown): boolean {
  const e = err as {
    status?: number;
    response?: { error_code?: number; description?: string };
  };
  const code = e?.status ?? e?.response?.error_code;
  const desc = (e?.response?.description ?? "").toLowerCase();

  return (
    (code === 400 &&
      (desc.includes("message to delete not found") ||
        desc.includes("message can't be deleted") ||
        desc.includes("message not modified") ||
        desc.includes("message can't be edited"))) ||
    code === 403 ||
    desc.includes("chat not found") ||
    desc.includes("query is too old")
  );
}

// Delete message but never let it break the flow.
async function deleteMessageSafely(
  context: BotContext,
  logger?: FastifyBaseLogger
): Promise<void> {
  try {
    await context.deleteMessage();
  } catch (err) {
    if (!isIgnorableTelegramError(err)) {
      logger?.warn({ err }, "deleteMessage failed");
    }
  }
}

// Delete message by id but never let it break the flow.
async function deleteMessageByIdSafely(
  context: BotContext,
  messageId: number,
  logger?: FastifyBaseLogger
): Promise<void> {
  try {
    await context.deleteMessage(messageId);
  } catch (err) {
    if (!isIgnorableTelegramError(err)) {
      logger?.warn({ err }, "deleteMessage by id failed");
    }
  }
}

// Always try to answer callback to stop the spinner; ignore benign errors.
async function answerCallbackSafely(
  context: BotContext,
  text?: string,
  logger?: FastifyBaseLogger
): Promise<void> {
  if (!context.callbackQuery) return;
  try {
    await context.answerCbQuery(text);
  } catch (err) {
    if (!isIgnorableTelegramError(err)) {
      logger?.debug({ err }, "answerCbQuery failed");
    }
  }
}

/** Safe edit wrapper that ignores "not modified" and other benign Telegram errors.
 * @returns true if the message was edited, false if it was unchanged
 */
async function safeEditMessage(
  context: BotContext,
  text: string,
  extra: Parameters<BotContext["editMessageText"]>[1],
  logger?: FastifyBaseLogger
): Promise<boolean> {
  try {
    await context.editMessageText(text, extra);
    return true;
  } catch (err) {
    const tgErr = err as TelegramError;
    const desc = tgErr?.response?.description ?? "";
    if (desc.includes("message is not modified")) {
      logger?.debug("Message content unchanged, skipping edit");
      return false;
    }
    if (!isIgnorableTelegramError(err)) {
      logger?.debug({ err }, "editMessageText failed");
      throw err;
    }
    return false;
  }
}

// -------- Render helpers --------

async function renderPortfolioOverview(
  context: BotContext,
  portfolio: PortfolioData,
  mode: "edit" | "reply" = "edit"
): Promise<boolean> {
  const text = MessageService.getPortfolioOverviewMessage(portfolio, "weship");
  const extra = {
    parse_mode: "Markdown" as const,
    ...DISABLE_LINK_PREVIEW,
    reply_markup: getOverviewKeyboard(),
  };
  if (mode === "edit") {
    return await safeEditMessage(context, text, extra);
  } else {
    await context.reply(text, extra);
    return true;
  }
}

async function renderPortfolioPosition(
  context: BotContext,
  portfolio: PortfolioData,
  positionIndex: number,
  mode: "edit" | "reply" = "edit"
) {
  const position = portfolio.positions[positionIndex];
  if (!position) {
    return mode === "edit"
      ? context.answerCbQuery?.("Position not found.")
      : context.reply("Position not found.");
  }
  const text = MessageService.getPositionDetailMessage(position);
  const extra = {
    parse_mode: "Markdown" as const,
    ...DISABLE_LINK_PREVIEW,
    reply_markup: getPositionDetailKeyboard(position, positionIndex),
  };
  return mode === "edit"
    ? safeEditMessage(context, text, extra)
    : context.reply(text, extra);
}

// -------- Entry command: /portfolio --------

export async function portfolioHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const loadingMessage = await ctx.reply("Loading Portfolio...", {
    parse_mode: "Markdown",
  });

  const loadingMessageId = (loadingMessage as { message_id: number })
    .message_id;

  const portfolioResponse = await PortfolioService.getUserPortfolio(
    ctx.user.walletAddress!
  );

  if (!portfolioResponse.success || !portfolioResponse.data) {
    await deleteMessageByIdSafely(ctx, loadingMessageId);
    await ctx.reply(`❌ ${portfolioResponse.message}`);
    return;
  }

  const portfolioData = portfolioResponse.data;
  setPortfolio(ctx, portfolioData);

  await deleteMessageByIdSafely(ctx, loadingMessageId);
  await ctx.reply(MessageService.getPortfolioOverviewMessage(portfolioData), {
    parse_mode: "Markdown",
    ...DISABLE_LINK_PREVIEW,
    reply_markup: getOverviewKeyboard(),
  });
}

// --- Callback registrations ---
export function registerPortfolioCallbacks(bot: Telegraf<BotContext>) {
  const router = new Composer<BotContext>();
  // User types /1, /2 -> open position detail
  router.hears(/^\/(\d+)\b$/, async (ctx) => {
    const portfolio = getPortfolio(ctx);
    if (!portfolio) return;

    const idx = Number(ctx.match[1]) - 1; // convert 1-based -> 0-based
    await renderPortfolioPosition(ctx, portfolio, idx, "reply");
  });

  // Back to overview
  router.action(PORTFOLIO_CALLBACK.portfolio.back, async (ctx) => {
    const portfolio = getPortfolio(ctx);
    if (!portfolio) return;

    await ctx.answerCbQuery("Back to overview");
    await renderPortfolioOverview(ctx, portfolio, "edit");
  });

  // Refresh portfolio
  router.action(PORTFOLIO_CALLBACK.portfolio.refresh, async (ctx) => {
    try {
      const walletAddress = ctx.user?.walletAddress;
      if (!walletAddress) {
        await ctx.answerCbQuery("No wallet connected");
        return;
      }

      const portfolioResponse =
        await PortfolioService.getUserPortfolio(walletAddress);

      if (!portfolioResponse.success || !portfolioResponse.data) {
        await answerCallbackSafely(
          ctx,
          portfolioResponse.message || "Refresh failed"
        );
        return;
      }

      const portfolioData = portfolioResponse.data;
      setPortfolio(ctx, portfolioData);

      const edited = await renderPortfolioOverview(ctx, portfolioData, "edit");
      await answerCallbackSafely(
        ctx,
        edited
          ? "Portfolio refreshed successfully"
          : "Portfolio is already up to date"
      );
    } catch (error: unknown) {
      const tgErr = error as TelegramError;
      const desc = tgErr?.response?.description ?? "";
      if (desc.includes("message is not modified")) {
        await answerCallbackSafely(ctx, "Portfolio is already up to date");
        return;
      }
      console.error("Portfolio refresh error:", error);
      await answerCallbackSafely(
        ctx,
        "Failed to refresh portfolio. Please try again."
      );
    }
  });

  // Handle all position actions (claim/toggle_ar/rebalance)
  router.action(POSITION_ACTION_REGEX, async (context) => {
    const portfolio = getPortfolio(context);
    if (!portfolio) return;

    const [, action, indexStr] = context.match as RegExpMatchArray;
    const positionIndex = Number(indexStr);
    const position = portfolio.positions[positionIndex];
    if (!position) return context.answerCbQuery("Position not found");

    switch (action) {
      case "claim":
        return context.answerCbQuery("Claim flow not implemented.");

      case "rebalance":
        return context.answerCbQuery("Rebalance not implemented.");
    }
  });

  router.action(PORTFOLIO_CALLBACK.ui.close, async (context) => {
    await Promise.allSettled([
      deleteMessageSafely(context),
      answerCallbackSafely(context, "Closed"),
    ]);
  });

  bot.use(router);
}
