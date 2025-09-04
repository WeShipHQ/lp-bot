import { InlineKeyboardMarkup } from "@telegraf/types";
import { MeteoraPoolData } from "@/types/meteora.types";

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