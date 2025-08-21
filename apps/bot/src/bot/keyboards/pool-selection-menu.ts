// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";
import { MeteoraPoolData } from "../../types/token.types";

export function getPoolSelectionKeyboard(
  pools: MeteoraPoolData[]
): InlineKeyboardMarkup {
  const buttons = pools.map(pool => ([
    {
      text: `🏊‍♂️ ${pool.pool_name} (APR: ${pool.apr.toFixed(1)}%)`,
      callback_data: `select-pool_${pool.pool_address}`,
    },
  ]));

  return {
    inline_keyboard: [
      ...buttons,
      [
        {
          text: "❌ Cancel",
          callback_data: "cancel_pool_selection",
        },
      ],
    ],
  };
}