import { Markup } from "telegraf";

export function getPoolDetailKeyboard(
  chatId: number,
  poolAddr: string,
  source: "dlmm" | "dammv1" | "dammv2"
): ReturnType<typeof Markup.inlineKeyboard> {
  const id = `${chatId}_${source}_${poolAddr}`;

  return Markup.inlineKeyboard([
    [Markup.button.callback("Open position", `pl_open_${id}`)],
    [
      Markup.button.callback("Buy 1 SOL", `pl_buy1_${id}`),
      Markup.button.callback("Buy 5 SOL", `pl_buy5_${id}`),
      Markup.button.callback("Buy X SOL", `pl_buyx_${id}`),
    ],
    [
      Markup.button.callback("Sell 50%", `pl_sell50_${id}`),
      Markup.button.callback("Sell 100%", `pl_sell100_${id}`),
      Markup.button.callback("Sell X", `pl_sellx_${id}`),
    ],
    [
      Markup.button.callback("Close", `pl_close_${id}`),
      Markup.button.callback("Refresh", `pl_refresh_${id}`),
    ],
  ]);
}

export function getTrendingDetailKeyboard(
  chatId: number,
  poolIndex: number,
  source: "dlmm" | "dammv1" | "dammv2"
): ReturnType<typeof Markup.inlineKeyboard> {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        " Close",
        `tr_close_detail_${chatId}_${poolIndex}_${source}`
      ),
      Markup.button.callback(
        "Refresh",
        `tr_refresh_detail_${chatId}_${poolIndex}_${source}`
      ),
    ],
  ]);
}
