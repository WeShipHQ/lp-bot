import { InlineKeyboardMarkup } from "@telegraf/types";

export function getTokenInfoKeyboard(
  address: string,
  type: "token" | "pool" | "unknown",
  poolType?: "damm_v1" | "damm_v2" | "dlmm"
): InlineKeyboardMarkup {
  const callbackData =
    type === "pool" && poolType
      ? `position_${type}_${address}_${poolType}`
      : `position_${type}_${address}`;

  return {
    inline_keyboard: [
      [
        {
          text: "💰 Open position",
          callback_data: callbackData,
        },
      ],
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

export function getPoolInfoKeyboard(
  address: string,
  poolType?: "damm_v1" | "damm_v2" | "dlmm"
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "💰 Open position",
          callback_data: "open_position",
        },
      ],
      [
        { text: "Close", callback_data: "close_pool_detail" },
        { text: "Refresh", callback_data: "refresh_pool_detail" },
      ],
    ],
  };
}
