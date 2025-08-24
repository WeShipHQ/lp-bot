import { PortfolioData, PortfolioPosition } from "@/types/portfolio.types";
import { InlineKeyboardMarkup } from "node_modules/telegraf/typings/core/types/typegram";

export function getOverviewKeyboard(
  _data: PortfolioData
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Refresh", callback_data: "portfolio:refresh" },
        { text: "Close", callback_data: "ui:close" },
      ],
    ],
  };
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
