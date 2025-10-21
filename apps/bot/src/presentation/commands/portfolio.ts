import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { GetPortfolioUseCase } from "@/application/portfolio/get-portfolio.use-case";
import { registerPortfolioCallbacks } from "../handlers/portfolio";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { PortfolioFormatter } from "../formatters/portfolio.formatter";
import { createTextMessage } from "../formatters/message-builder";
import { MessageService } from "@/application/message/message.service";

export function portfolioCommand(bot: Telegraf<BotContext>) {
  bot.command("portfolio", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const messageService = container.get<MessageService>(
      DI_TOKENS.MessageService
    );

    const loadingMessage = await messageService.send({
      context: { chatId },
      payload: createTextMessage("portfolio.loading", "⏳ Loading portfolio...", {
        parseMode: "markdown",
        disableLinkPreview: true,
      }),
    });
    try {
      const useCase = container.get(GetPortfolioUseCase);
      const portfolio = await useCase.execute(ctx.user.id, false);

      // Build unclaimed fees map (per position address) via adapters
      const walletAddress = ctx.user.walletAddress;
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
            } catch {}
          }
        } catch {}
      }

      const overviewPayload = PortfolioFormatter.createDomainOverviewPayload(
        portfolio,
        {
          botName: ctx.botInfo?.username,
          unclaimedFeesByAddress: feesByAddress,
        }
      );

      await messageService.edit({
        context: {
          chatId,
          messageId: loadingMessage.messageId,
        },
        payload: overviewPayload,
      });
    } catch (error) {
      await messageService.edit({
        context: {
          chatId,
          messageId: loadingMessage.messageId,
        },
        payload: createTextMessage(
          "portfolio.error",
          "❌ Failed to load portfolio. Please try again.",
          {
            parseMode: "markdown",
            disableLinkPreview: true,
          }
        ),
      });
    }
  });

  // Register callbacks for refresh/close actions
  registerPortfolioCallbacks(bot);
}
