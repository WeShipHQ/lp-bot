// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getTokenInfoKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💰 Open position", callback_data: "open_position" }],
      [
        { text: "Buy 1 SOL", callback_data: "buy_1_sol" },
        { text: "Buy 5 SOL", callback_data: "buy_5_sol" },
        { text: "Buy X SOL", callback_data: "buy_x_sol" },
      ],
      [
        { text: "Sell 50%", callback_data: "sell_50_percent" },
        { text: "Sell 100%", callback_data: "sell_100_percent" },
        { text: "Sell X%", callback_data: "sell_x_percent" },
      ],
      [
        {
          text: "Close",
          callback_data: "close_position",
        },
        {
          text: "Refresh",
          callback_data: "refresh",
        },
      ],
    ],
  };
}
