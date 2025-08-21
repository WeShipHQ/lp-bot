// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

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
      ],
      // [
      //   {
      //     text: "📈 Curve (Concentrated)",
      //     callback_data: `create-position_curve_${poolAddress}`,
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
