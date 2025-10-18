import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { GetPortfolioUseCase } from "@/application/portfolio/get-portfolio.use-case";
import { CalculateMetricsUseCase } from "@/application/portfolio/calculate-metrics.use-case";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import { db } from "@/db";
import { dexRegistry } from "@/services/dex-registry.service";
import { registerPortfolioCallbacks } from "../handlers/portfolio";

export function portfolioCommand(bot: Telegraf<BotContext>) {
  bot.command("portfolio", async (ctx) => {
    const loading = await ctx.reply("Loading portfolio...");
    try {
      const repo = new PositionRepository(db as any);
      const useCase = new GetPortfolioUseCase(repo, dexRegistry);
      const portfolio = await useCase.execute(ctx.user.id, false);
      const metrics = new CalculateMetricsUseCase().execute(portfolio);

      const lines: string[] = [];
      lines.push("📊 Portfolio Overview");
      lines.push("");
      lines.push(`Positions: ${metrics.activePositions}/${metrics.totalPositions}`);
      lines.push(`Total Value: ${metrics.totalValueUsd.toLocaleString()}`);
      lines.push(`PnL: ${metrics.totalPnLUsd.toLocaleString()} (${metrics.totalPnLPercentage.toFixed(2)}%)`);
      lines.push(`Fees Earned: ${metrics.totalFeesUsd.toLocaleString()}`);
      if (metrics.dexBreakdown.length > 0) {
        lines.push("");
        lines.push("By DEX:");
        for (const d of metrics.dexBreakdown) {
          lines.push(`• ${d.dex.toUpperCase()}: ${d.positions} pos, ${d.valueUsd.toLocaleString()} value`);
        }
      }

      await ctx.telegram.editMessageText(ctx.chat!.id, (loading as any).message_id, undefined, lines.join("\n"), {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      await ctx.telegram.editMessageText(ctx.chat!.id, (loading as any).message_id, undefined, "❌ Failed to load portfolio. Please try again.", { parse_mode: "Markdown" });
    }
  });

  // Keep callbacks registration for other flows
  registerPortfolioCallbacks(bot);
}
