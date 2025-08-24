import { FastifyInstance } from "fastify";
import { MessageService } from "@/services/message.service";
import { PortfolioService } from "@/services/portfolio.service";
import { BotContext } from "@/types/bot.types";
import { getPortfolioOverviewKeyboard } from "../keyboards";

export async function portfolioHandler(
  ctx: BotContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _server: FastifyInstance
) {
  if (!ctx.user) {
    await ctx.reply(
      MessageService.getErrorMessage(
        "Unable to authenticate user. Please try again."
      )
    );
    return;
  }

  await ctx.reply("Loading Portfolio...", {
    parse_mode: "Markdown",
  });

  const user = ctx.user;

  if (!user.walletAddress) {
    await ctx.reply(
      MessageService.getErrorMessage(
        "Wallet address not found. Please connect your wallet first."
      )
    );
    return;
  }

  const portfolioResult = await PortfolioService.getUserPortfolio(
    "FL4j8EEMAPUjrvASnqX7VdpWZJji1LFsAxwojhpueUYt"
  );

  if (!portfolioResult.success || !portfolioResult.data) {
    await ctx.reply(MessageService.getErrorMessage(portfolioResult.message));
    return;
  }

  const responseMessage = MessageService.getPortfolioMessage(
    portfolioResult.data
  );

  await ctx.reply(responseMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: getPortfolioOverviewKeyboard(portfolioResult.data)
        .inline_keyboard,
    },
  });
}

export async function portfolioHandlerCallback() {}
