import { FastifyBaseLogger } from "fastify";
import { Composer, Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { PF_PATTERNS } from "../constants/portfolio.callbacks";
import { PortfolioFormatter } from "../formatters/portfolio.formatter";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { GetPortfolioUseCase } from "@/application/portfolio/get-portfolio.use-case";
import { MessageService } from "@/application/message/message.service";
import { MessagePayload } from "@/domain/message";

interface TelegramError {
  response?: {
    description?: string;
    error_code?: number;
  };
}

// -------- Error helpers --------

function isIgnorableTelegramError(err: unknown): boolean {
  const errorLike = err as {
    status?: number;
    response?: { error_code?: number; description?: string };
  };
  const code = errorLike?.status ?? errorLike?.response?.error_code;
  const desc = (errorLike?.response?.description ?? "").toLowerCase();

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

export async function answerCallbackSafely(
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

async function safeEditMessage(
  context: BotContext,
  payload: MessagePayload,
  logger?: FastifyBaseLogger
): Promise<boolean> {
  const chatId = context.chat?.id;
  const messageId = context.callbackQuery?.message?.message_id;
  if (!chatId || !messageId) {
    return false;
  }

  const messageService = container.get<MessageService>(
    DI_TOKENS.MessageService
  );

  try {
    await messageService.edit({
      context: { chatId, messageId },
      payload,
    });
    return true;
  } catch (err) {
    const tgErr = err as TelegramError;
    const desc = tgErr?.response?.description ?? "";
    if (desc.includes("message is not modified")) {
      logger?.debug("Message content unchanged, skipping edit");
      return false;
    }
    if (!isIgnorableTelegramError(err)) {
      logger?.debug({ err }, "editMessage failed");
      throw err;
    }
    return false;
  }
}

async function buildPortfolioOverviewPayload(
  context: BotContext,
  forceRefresh = false
): Promise<MessagePayload> {
  const userId = context.user?.id;
  const botName = context.botInfo?.username;
  const walletAddress = context.user?.walletAddress;

  const getPortfolioUc = container.get(GetPortfolioUseCase);
  const portfolio = await getPortfolioUc.execute(userId, forceRefresh);

  const feesByAddress: Record<string, number> = {};
  if (walletAddress) {
    // UnifiedPosition no longer provides USD-denominated fee data; enrichment is TBD.
  }

  return PortfolioFormatter.createDomainOverviewPayload(portfolio, {
    botName,
    unclaimedFeesByAddress: feesByAddress,
  });
}

export function registerPortfolioCallbacks(bot: Telegraf<BotContext>) {
  const router = new Composer<BotContext>();

  router.action(PF_PATTERNS.overview.refresh, async (ctx) => {
    try {
      const payload = await buildPortfolioOverviewPayload(ctx, true);
      const edited = await safeEditMessage(ctx, payload);
      await answerCallbackSafely(
        ctx,
        edited ? "Portfolio refreshed" : "Already up to date"
      );
    } catch (error: unknown) {
      const tgErr = error as TelegramError;
      const desc = tgErr?.response?.description ?? "";
      if (desc.includes("message is not modified")) {
        await answerCallbackSafely(ctx, "Already up to date");
        return;
      }
      await answerCallbackSafely(ctx, "Failed to refresh portfolio");
    }
  });

  // Close portfolio message
  router.action(PF_PATTERNS.overview.close, async (context) => {
    try {
      await context.deleteMessage();
    } catch (err) {
      if (!isIgnorableTelegramError(err)) {
        await answerCallbackSafely(context, "Unable to close");
        return;
      }
    }
    await answerCallbackSafely(context, "Closed");
  });

  bot.use(router);
}
