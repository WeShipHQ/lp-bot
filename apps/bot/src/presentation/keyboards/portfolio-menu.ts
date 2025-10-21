import { InlineKeyboardMarkup } from "@telegraf/types";
import { PF_CALLBACKS } from "../constants/portfolio.callbacks";

export function getOverviewKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Close", callback_data: PF_CALLBACKS.overview.close },
        { text: "Refresh", callback_data: PF_CALLBACKS.overview.refresh },
      ],
    ],
  };
}

export function getPositionDetailKeyboard(index: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Close position", callback_data: PF_CALLBACKS.position.close(index) },
        { text: "Claim fees", callback_data: PF_CALLBACKS.position.claim(index) },
      ],
      [
        { text: "Rebalance now", callback_data: PF_CALLBACKS.position.rebalance(index) },
        {
          text: "Rebalancing settings",
          callback_data: PF_CALLBACKS.position.settings(index),
        },
      ],
      [
        { text: "Refresh", callback_data: PF_CALLBACKS.position.refresh(index) },
      ],
    ],
  };
}
