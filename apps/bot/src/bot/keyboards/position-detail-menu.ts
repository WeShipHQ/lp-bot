import { InlineKeyboardMarkup } from "@telegraf/types";

export function getPositionDetailKeyboard(
  positionAddress: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "Close position",
          callback_data: "pos_close_confirmation",
        },
        { text: "Claim fees", callback_data: "pos_claim_confirmation" },
      ],
      [
        {
          text: "Rebalance now",
          callback_data: `pos_rebalance_${positionAddress}`,
        },
        {
          text: "Rebalancing settings",
          callback_data: `pos_settings_${positionAddress}`,
        },
      ],
      [
        {
          text: "Take Profit",
          callback_data: `pos_take_profit_${positionAddress}`,
        },
        {
          text: "Stop Loss",
          callback_data: `pos_stop_loss_${positionAddress}`,
        },
      ],
      [{ text: "Refresh", callback_data: `pos_refresh_${positionAddress}` }],
    ],
  };
}

/**
 * Get keyboard for position close confirmation
 */
export function getPositionCloseConfirmKeyboard(
  positionAddress: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Yes, Close Position", callback_data: `pos_close_yes` },
        {
          text: "❌ No, Cancel",
          // callback_data: `1pos_close_cancel_${positionAddress}`,
          callback_data: `pos_close_no`,
        },
      ],
    ],
  };
}

/**
 * Get keyboard for claim fees confirmation
 */
export function getClaimFeesConfirmKeyboard(
  positionAddress: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Yes, Claim Fees",
          callback_data: `pos_claim_yes_${positionAddress}`,
        },
        {
          text: "❌ No, Cancel",
          callback_data: `pos_claim_no`,
        },
      ],
    ],
  };
}
