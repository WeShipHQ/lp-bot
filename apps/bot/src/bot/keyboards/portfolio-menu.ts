import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";
import { InlineKeyboardMarkup } from "node_modules/telegraf/typings/core/types/typegram";

export function getPortfolioOverviewKeyboard(
  data: PortfolioData
): InlineKeyboardMarkup {
  const rows: { text: string; callback_data: string }[][] = [];

  data.positions.forEach((p, i) => {
    rows.push([
      {
        text: `/${i + 1} ${p.token_x_info.symbol}-${p.token_y_info.symbol}`,
        callback_data: `pos:${i}`,
      },
    ]);
  });

  rows.push([
    { text: "Refresh", callback_data: "portfolio:refresh" },
    { text: "Close", callback_data: "ui:close" },
  ]);

  return { inline_keyboard: rows };
}

export function getPositionDetailKeyboard(
  p: PortfolioPosition,
  index: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Claim fees", callback_data: `pos:claim:${index}` },
        {
          text: p.auto_rebalancing_enabled
            ? "Disable rebalancing"
            : "Enable rebalancing",
          callback_data: `pos:toggle_ar:${index}`,
        },
      ],
      [
        { text: "Rebalance now", callback_data: `pos:rebalance:${index}` },
        { text: "Back", callback_data: "portfolio:back" },
      ],
      [
        {
          text: "View on Dexscreener",
          url: `https://dexscreener.com/solana/${p.pool_address}`,
        },
      ],
    ],
  };
}
