import { InlineKeyboardMarkup } from "@telegraf/types";
import { PositionDetailCallbacks } from "./position-detail.actions";

export function getPositionDetailKeyboard(positionId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Close position",
          callback_data: PositionDetailCallbacks.CLOSE_CONFIRM,
        },
        {
          text: "Claim fees",
          callback_data: PositionDetailCallbacks.CLAIM_CONFIRM,
        },
      ],
      [
        {
          text: "Rebalance now",
          callback_data: PositionDetailCallbacks.REBALANCE_CONFIRM,
        },
        {
          text: "Rebalancing settings",
          callback_data: PositionDetailCallbacks.SETTINGS(positionId),
        },
      ],
      [
        {
          text: "Take Profit",
          callback_data: PositionDetailCallbacks.TAKE_PROFIT(positionId),
        },
        {
          text: "Stop Loss",
          callback_data: PositionDetailCallbacks.STOP_LOSS(positionId),
        },
      ],
      [
        {
          text: "Refresh",
          callback_data: PositionDetailCallbacks.REFRESH(positionId),
        },
      ],
    ],
  };
}

export function getPositionCloseConfirmKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Yes, Close Position",
          callback_data: PositionDetailCallbacks.CLOSE_APPROVE,
        },
        {
          text: "❌ No, Cancel",
          callback_data: PositionDetailCallbacks.CLOSE_DECLINE,
        },
      ],
    ],
  };
}

export function getClaimFeesConfirmKeyboard(positionId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Yes, Claim Fees",
          callback_data: PositionDetailCallbacks.CLAIM_APPROVE(positionId),
        },
        {
          text: "❌ No, Cancel",
          callback_data: PositionDetailCallbacks.CLAIM_DECLINE,
        },
      ],
    ],
  };
}

export function getRebalanceConfirmKeyboard(positionId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Yes, Rebalance Now",
          callback_data: PositionDetailCallbacks.REBALANCE_APPROVE(positionId),
        },
        {
          text: "❌ No, Cancel",
          callback_data: PositionDetailCallbacks.REBALANCE_DECLINE,
        },
      ],
    ],
  };
}
