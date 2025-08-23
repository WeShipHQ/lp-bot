import { InlineKeyboardMarkup } from "@telegraf/types";

export function getPositionConfirmationKeyboard(
  poolAddress: string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "⚖️ Spot (Balanced)",
          callback_data: `create-position_spot_${poolAddress}`,
        },
        {
          text: "📈 Curve (Concentrated)",
          callback_data: `curve_${poolAddress}`,
        },
        {
          text: "🎯 Single-sided",
          callback_data: `single_${poolAddress}`,
        },
      ],
      // [
      //   {
      //     text: "📈 Curve (Concentrated)",
      //     callback_data: `curve_${poolAddress}`,
      //   },
      //   {
      //     text: "🎯 Single-sided",
      //     callback_data: `single_${poolAddress}`,
      //   },
      // ],
      // [
      //   {
      //     text: "🎯 Single-sided",
      //     callback_data: `create-position_single_${poolAddress}`,
      //   },
      // ],
      // [
      //   {
      //     text: "❌ Cancel",
      //     callback_data: `cancel_position_${poolAddress}`,
      //   },
      // ],
    ],
  };
}
