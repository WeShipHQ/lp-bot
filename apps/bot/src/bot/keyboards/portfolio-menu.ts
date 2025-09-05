import { InlineKeyboardMarkup } from "@telegraf/types";
import { PortfolioPosition } from "@/types/portfolio.types";

export function getOverviewKeyboard(): InlineKeyboardMarkup {
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
  position: PortfolioPosition,
  index: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Claim fees", callback_data: `pos:claim:${index}` },
        // {
        //   text: position.auto_rebalancing_enabled
        //     ? "Disable rebalancing"
        //     : "Enable rebalancing",
        //   callback_data: `pos:toggle_ar:${index}`,
        // },
      ],
      [
        { text: "Rebalance now", callback_data: `pos:rebalance:${index}` },
        { text: "Back", callback_data: "portfolio:back" },
      ],
    ],
  };
}
