// bot/keyboards/trending-menu.ts
import { Markup } from "telegraf";
import { trendingService } from "../../services/trending.service";

export function getTrendingKeyboard(
  chatId: number
): ReturnType<typeof Markup.inlineKeyboard> {
  const st = trendingService.getState(chatId);
  const apiPage = st?.apiPage ?? 0;

  const row: any[] = [];

  if (apiPage > 0) {
    row.push(Markup.button.callback("◀️ Prev", `tr_prev_${chatId}`));
  } else {
    row.push(Markup.button.callback("◀️ Prev", `tr_prev_${chatId}`));
  }

  row.push(Markup.button.callback("Next ▶️", `tr_next_${chatId}`));

  row.push(Markup.button.callback("🔄", `tr_refresh_${chatId}`));

  const rows: any[] = [];
  rows.push(row);
  return Markup.inlineKeyboard(rows);
}
