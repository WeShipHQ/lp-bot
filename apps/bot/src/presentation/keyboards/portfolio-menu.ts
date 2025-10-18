import { InlineKeyboardMarkup } from "@telegraf/types";

export function getOverviewKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Close", callback_data: "ui:close" },
        { text: "Refresh", callback_data: "portfolio:refresh" },
      ],
    ],
  };
}

export function getPositionDetailKeyboard(index: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Close position", callback_data: `pos:close:${index}` },
        { text: "Claim fees", callback_data: `pos:claim:${index}` },
      ],
      [
        { text: "Rebalance now", callback_data: `pos:rebalance:${index}` },
        {
          text: "Rebalancing settings",
          callback_data: `pos:rebalance_settings:${index}`,
        },
      ],
      [
        { text: "Take Profit", callback_data: `pos:take_profit:${index}` },
        { text: "Stop Loss", callback_data: `pos:stop_loss:${index}` },
      ],
      [{ text: "Refresh", callback_data: `pos:refresh:${index}` }],
    ],
  };
}
