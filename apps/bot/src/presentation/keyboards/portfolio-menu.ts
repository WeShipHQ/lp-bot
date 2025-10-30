import { MessageInlineKeyboard } from "@/domain/message";
import { PF_CALLBACKS } from "../constants/portfolio.callbacks";

export function getOverviewKeyboard(): MessageInlineKeyboard {
  return {
    type: "inline",
    rows: [
      [
        { text: "Close", callbackData: PF_CALLBACKS.overview.close },
        { text: "Refresh", callbackData: PF_CALLBACKS.overview.refresh },
      ],
    ],
  };
}

export function getPositionDetailKeyboard(index: number): MessageInlineKeyboard {
  return {
    type: "inline",
    rows: [
      [
        {
          text: "Close position",
          callbackData: PF_CALLBACKS.position.close(index),
        },
        {
          text: "Claim fees",
          callbackData: PF_CALLBACKS.position.claim(index),
        },
      ],
      [
        {
          text: "Rebalance now",
          callbackData: PF_CALLBACKS.position.rebalance(index),
        },
        {
          text: "Rebalancing settings",
          callbackData: PF_CALLBACKS.position.settings(index),
        },
      ],
      [
        {
          text: "Refresh",
          callbackData: PF_CALLBACKS.position.refresh(index),
        },
      ],
    ],
  };
}
