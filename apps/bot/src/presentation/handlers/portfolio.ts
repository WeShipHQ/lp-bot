import { FastifyBaseLogger } from "fastify";
import { Composer, Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { getOverviewKeyboard } from "../keyboards/portfolio-menu";
import { PF_PATTERNS } from "../constants/portfolio.callbacks";
import { PortfolioFormatter } from "../formatters/portfolio.formatter";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { GetPortfolioUseCase } from "@/application/portfolio/get-portfolio.use-case";

interface TelegramError {
  response?: {
    description?: string;
    error_code?: number;
  };
}

export const DISABLE_LINK_PREVIEW = {
  link_preview_options: { is_disabled: true as const },
} as const;

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

// Build the latest portfolio overview text using use-cases and adapter data
async function buildPortfolioOverviewText(context: BotContext, forceRefresh = false): Promise<string> {
  const userId = context.user?.id;
  const botName = context.botInfo?.username;
  const walletAddress = context.user?.walletAddress;

  const getPortfolioUc = container.get(GetPortfolioUseCase);
  const portfolio = await getPortfolioUc.execute(userId, forceRefresh);

  // Build a map of unclaimed fees by position address using adapters via dexRegistry
  const feesByAddress: Record<string, number> = {};
  if (walletAddress) {
    try {
      const registry = container.get<typeof import("@/services/dex-registry.service").dexRegistry>(DI_TOKENS.DexRegistry);
      const active = portfolio.getActivePositions();
      const dexes = Array.from(new Set(active.map((p) => p.dex)));
      for (const dex of dexes) {
        try {
          const adapter = registry.get(dex as any);
          const unified = await adapter.getUserPositions(walletAddress);
          for (const up of unified) {
            feesByAddress[up.address] = (feesByAddress[up.address] || 0) + (up.unclaimedFeesUsd || 0);
          }
        } catch (e) {
          // Ignore individual dex failures; keep partial data
          // console.warn("Failed to fetch positions for dex", dex, e);
        }
      }
    } catch {}
  }

  return PortfolioFormatter.formatDomainOverview(portfolio, {
    botName,
    unclaimedFeesByAddress: feesByAddress,
  });
}

export function registerPortfolioCallbacks(bot: Telegraf<BotContext>) {
  const router = new Composer<BotContext>();

  // Refresh portfolio (standardized callback)
  router.action(PF_PATTERNS.overview.refresh, async (ctx) => {
    try {
      const text = await buildPortfolioOverviewText(ctx, true);
      const edited = await safeEditMessage(
        ctx,
        text,
        { parse_mode: "Markdown", ...DISABLE_LINK_PREVIEW, reply_markup: getOverviewKeyboard() }
      );
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
