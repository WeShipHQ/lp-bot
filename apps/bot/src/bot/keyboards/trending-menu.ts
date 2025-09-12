import { trendingService } from "@/services/trending.service";
import { Markup } from "telegraf";

export function getTrendingKeyboard(
  chatId: number,
  currentSortBy: "apy" | "tvl" | "volume24h" | "fee_tvl_ratio" = "apy",
  currentSource: "dlmm" | "dammv1" | "dammv2" = "dlmm"
): ReturnType<typeof Markup.inlineKeyboard> {
  const st = trendingService.getState(chatId);
  const apiPage = st?.apiPage ?? 0;

  const navRow: any[] = [];
  navRow.push(Markup.button.callback(" Prev", `tr_prev_${chatId}`));
  navRow.push(
    Markup.button.callback(`Page ${apiPage + 1}/5`, `tr_refresh_${chatId}`)
  );
  navRow.push(Markup.button.callback("Next ", `tr_next_${chatId}`));
  navRow.push(Markup.button.callback("🔄", `tr_refresh_${chatId}`));

  const sortRow: any[] = [];

  const apyButton = Markup.button.callback(
    `${currentSortBy === "apy" ? "✓" : ""} APY`,
    `tr_sort_apy_${chatId}`
  );

  const tvlButton = Markup.button.callback(
    `${currentSortBy === "tvl" ? "✓" : ""} TVL`,
    `tr_sort_tvl_${chatId}`
  );

  const volButton = Markup.button.callback(
    `${currentSortBy === "volume24h" ? "✓" : ""} 24h Vol`,
    `tr_sort_volume24h_${chatId}`
  );

  const ratioButton = Markup.button.callback(
    `${currentSortBy === "fee_tvl_ratio" ? "✓" : ""} Fee/TVL`,
    `tr_sort_fee_tvl_ratio_${chatId}`
  );

  sortRow.push(apyButton, tvlButton, volButton, ratioButton);

  const rows: any[] = [navRow, sortRow];
  return Markup.inlineKeyboard(rows);
}
