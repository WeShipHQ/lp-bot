import { Context } from "telegraf";
import { FastifyInstance } from "fastify";
import { formatCurrency, formatPercentage } from "../utils/formatters";
import { getPortfolioKeyboard } from "../keyboards/portfolio-menu";

// Fake portfolio data for demo
const FAKE_PORTFOLIO = {
  totalValue: 15420.5,
  totalPnL: 1240.3,
  totalPnLPercentage: 8.75,
  positions: [
    {
      id: "1",
      pair: "SOL/USDC",
      strategy: "DLMM",
      value: 8500.25,
      pnl: 850.15,
      pnlPercentage: 11.1,
      feesEarned: 45.2,
      status: "ACTIVE",
    },
    {
      id: "2",
      pair: "RAY/SOL",
      strategy: "CONCENTRATED",
      value: 4200.75,
      pnl: 320.45,
      pnlPercentage: 8.3,
      feesEarned: 28.9,
      status: "ACTIVE",
    },
    {
      id: "3",
      pair: "ORCA/USDC",
      strategy: "DLMM",
      value: 2719.5,
      pnl: 69.7,
      pnlPercentage: 2.6,
      feesEarned: 15.3,
      status: "REBALANCING",
    },
  ],
};

export async function portfolioHandler(ctx: Context, _server: FastifyInstance) {
  const portfolio = FAKE_PORTFOLIO;

  let message = `
💼 *Your Portfolio Overview*

`;

  // Portfolio summary
  message += `📊 *Total Portfolio Value:* ${formatCurrency(portfolio.totalValue)}\n`;
  message += `📈 *Total P&L:* ${portfolio.totalPnL >= 0 ? "🟢" : "🔴"} ${formatCurrency(portfolio.totalPnL)} (${formatPercentage(portfolio.totalPnLPercentage)})\n\n`;

  // Individual positions
  message += `*Active Positions:*\n\n`;

  portfolio.positions.forEach((position, index) => {
    const statusEmoji =
      position.status === "ACTIVE"
        ? "🟢"
        : position.status === "REBALANCING"
          ? "🟡"
          : "🔴";

    message += `${index + 1}. *${position.pair}* ${statusEmoji}\n`;
    message += `   Strategy: ${position.strategy}\n`;
    message += `   Value: ${formatCurrency(position.value)}\n`;
    message += `   P&L: ${position.pnl >= 0 ? "🟢" : "🔴"} ${formatCurrency(position.pnl)} (${formatPercentage(position.pnlPercentage)})\n`;
    message += `   Fees: ${formatCurrency(position.feesEarned)}\n\n`;
  });

  message += `_💡 This is demo data. Connect your wallet to see real positions._`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: getPortfolioKeyboard().inline_keyboard,
    },
  });
}
