import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { GetPortfolioUseCase } from "@/application/portfolio/get-portfolio.use-case";
import { registerPortfolioCallbacks } from "../handlers/portfolio";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { PortfolioFormatter } from "../formatters/portfolio.formatter";
import { getOverviewKeyboard } from "../keyboards/portfolio-menu";

export function portfolioCommand(bot: Telegraf<BotContext>) {
  bot.command("portfolio", async (ctx) => {
    const loading = await ctx.reply("Loading portfolio...");
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

      const text = PortfolioFormatter.formatDomainOverview(portfolio, {
        botName: ctx.botInfo?.username,
        unclaimedFeesByAddress: feesByAddress,
      });

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        (loading as any).message_id,
        undefined,
        text,
        {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: true },
          reply_markup: getOverviewKeyboard(),
        }
      );
    } catch (error) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        (loading as any).message_id,
        undefined,
        "❌ Failed to load portfolio. Please try again.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // Register callbacks for refresh/close actions
  registerPortfolioCallbacks(bot);
}
