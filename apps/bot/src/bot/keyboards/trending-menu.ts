import { PoolSortCriteria } from "@/services/hot-pools/types";
import { trendingService } from "@/services/trending.service";
import { Markup } from "telegraf";

export function getTrendingKeyboard(
  chatId: number,
  currentSortBy: PoolSortCriteria = "tvl",
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

  // Sort buttons with check icons
  const sortRow: any[] = [];

  const tvlButton = Markup.button.callback(
    `${currentSortBy === "tvl" ? "✅ " : ""}TVL`,
    `tr_sort_tvl_${chatId}`
  );

  const volButton = Markup.button.callback(
    `${currentSortBy === 'volume' ? "✅ " : ""}24h Vol`,
    `tr_sort_volume_${chatId}`
  );

  const ratioButton = Markup.button.callback(
    `${currentSortBy === 'feetvlratio' ? "✅ " : ""}Fee/TVL`,
    `tr_sort_feetvlratio_${chatId}`
  );

  sortRow.push(tvlButton, volButton, ratioButton);

  // Source buttons with check icons
  const srcRow: any[] = [];
  const dlmmBtn = Markup.button.callback(
    `${currentSource === "dlmm" ? "✅ " : ""}DLMM`,
    `tr_src_dlmm_${chatId}`
  );

  const v1Btn = Markup.button.callback(
    `${currentSource === "dammv1" ? "✅ " : ""}DAMM v1`,
    `tr_src_dammv1_${chatId}`
  );

  const v2Btn = Markup.button.callback(
    `${currentSource === "dammv2" ? "✅ " : ""}DAMM v2`,
    `tr_src_dammv2_${chatId}`
  );

  srcRow.push(dlmmBtn, v1Btn, v2Btn);

  const rows: any[] = [navRow, sortRow, srcRow];
  return Markup.inlineKeyboard(rows);
}
