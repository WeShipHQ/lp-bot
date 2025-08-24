import { FastifyInstance } from "fastify";
import { MessageService } from "@/services/message.service";
import { PortfolioService } from "@/services/portfolio.service";
import { BotContext } from "@/types/bot.types";
import {
  getOverviewKeyboard,
  getPositionDetailKeyboard,
} from "../keyboards/portfolio-menu";
import { PortfolioData } from "@/types/portfolio.types";

const session = new Map<number, PortfolioData>();
const noPreview = () => ({
  link_preview_options: { is_disabled: true as const },
});

export async function portfolioHandler(
  ctx: BotContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _server: FastifyInstance
) {
  if (!ctx.user?.walletAddress) {
    await ctx.reply(
      MessageService.getErrorMessage(
        "Wallet address not found. Please connect your wallet first."
      )
    );
    return;
  }

  await ctx.reply("Loading Portfolio...", {
    parse_mode: "Markdown",
  });

  const res = await PortfolioService.getUserPortfolio(ctx.user.walletAddress);

  if (!res.success || !res.data) {
    await ctx.reply(`❌ ${res.message}`);
    return;
  }

  const data = res.data;
  session.set(ctx.chat!.id, data);

  const responseMessage = MessageService.getPortfolioOverviewMessage(data);

  await ctx.reply(responseMessage, {
    parse_mode: "Markdown",
    ...noPreview(),
    reply_markup: getOverviewKeyboard(data),
  });
}

export function registerPortfolioCallbacks(
  bot: import("telegraf").Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.hears(/^\/(\d+)\b/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const data = session.get(chatId);
    if (!data) return;

    const idx = Math.max(0, Number(ctx.match[1]) - 1);
    const p = data.positions[idx];
    if (!p) {
      await ctx.reply("Position not found.");
      return;
    }

    await ctx.reply(MessageService.getPositionDetailMessage(p, idx), {
      parse_mode: "Markdown",
      ...noPreview(),
      reply_markup: getPositionDetailKeyboard(p, idx),
    });
  });

  bot.action("portfolio:back", async (ctx) => {
    const chatId = ctx.chat!.id;
    const data = session.get(chatId);
    if (!data) return;

    await ctx.editMessageText(
      MessageService.getPortfolioOverviewMessage(data),
      {
        parse_mode: "Markdown",
        ...noPreview(),
        reply_markup: getOverviewKeyboard(data),
      }
    );
  });

  bot.action("portfolio:refresh", async (ctx) => {
    const wallet = ctx.user?.walletAddress;
    if (!wallet) return;

    const res = await PortfolioService.getUserPortfolio(wallet);
    if (!res.success) {
      await ctx.answerCbQuery("Refresh failed");
      return;
    }

    session.set(ctx.chat!.id, res.data);
    await ctx.editMessageText(
      MessageService.getPortfolioOverviewMessage(res.data),
      {
        parse_mode: "Markdown",
        ...noPreview(),
        reply_markup: getOverviewKeyboard(res.data),
      }
    );
    await ctx.answerCbQuery("Refreshed");
  });

  bot.action(/^pos:claim:\d+$/, async (ctx) => {
    await ctx.answerCbQuery("Claim flow not implemented.");
  });

  bot.action(/^pos:toggle_ar:\d+$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const data = session.get(chatId);
    if (!data) return;

    const idx = Number((ctx.match as RegExpMatchArray)[0].split(":")[2]);
    const p = data.positions[idx];
    if (!p) return;

    p.auto_rebalancing_enabled = !p.auto_rebalancing_enabled;
    await ctx.editMessageText(MessageService.getPositionDetailMessage(p, idx), {
      parse_mode: "Markdown",
      ...noPreview(),
      reply_markup: getPositionDetailKeyboard(p, idx),
    });
    await ctx.answerCbQuery(
      p.auto_rebalancing_enabled
        ? "Auto-rebalancing enabled"
        : "Auto-rebalancing disabled"
    );
  });

  bot.action(/^pos:rebalance:\d+$/, async (ctx) => {
    await ctx.answerCbQuery("Rebalance not implemented.");
  });

  bot.action("ui:close", async (ctx) => {
    await ctx.deleteMessage().catch(() => null);
  });
}
