// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getPortfolioKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Close all", callback_data: "close_all" },
        { text: "Claim fees", callback_data: "claim_fees" },
      ],
      [
        { text: "Close", callback_data: "close" },
        { text: "Refresh", callback_data: "refresh" },
      ],
    ],
  };
}
