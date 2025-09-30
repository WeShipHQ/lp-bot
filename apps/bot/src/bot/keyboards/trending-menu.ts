import { trendingService } from "@/services/trending.service";
import { TrendingPoolsSortCriteria } from "@/types/trending.types";
import { InlineKeyboardButton } from "@telegraf/types";
import { Markup } from "telegraf";
import { InlineKeyboardMarkup } from "telegraf/types";

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

function encodeCallback(
  action: string,
  page: number,
  sort: TrendingPoolsSortCriteria
): string {
  return `${action}:${page}:${sort}`;
}

export function getSarosTrendingKeyboard(
  currentPage: number,
  currentSort: TrendingPoolsSortCriteria,
  totalPages: number
): InlineKeyboardMarkup {
  const keyboard: InlineKeyboardButton[][] = [];

  const navRow: InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    navRow.push({
      text: "◀️ Prev",
      callback_data: encodeCallback("trend", currentPage - 1, currentSort),
    });
  }

  navRow.push({
    text: `📄 ${currentPage}/${totalPages}`,
    callback_data: "noop",
  });

  if (currentPage < totalPages) {
    navRow.push({
      text: "Next ▶️",
      callback_data: encodeCallback("trend", currentPage + 1, currentSort),
    });
  }

  keyboard.push(navRow);

  // Sort row
  const sortRow: InlineKeyboardButton[] = [
    {
      text: currentSort === "apy" ? "✓ APY" : "APY",
      callback_data: encodeCallback("trend", 1, "apy"),
    },
    {
      text: currentSort === "tvl" ? "✓ TVL" : "TVL",
      callback_data: encodeCallback("trend", 1, "tvl"),
    },
    {
      text: currentSort === "volume24h" ? "✓ 24h Vol" : "24h Vol",
      callback_data: encodeCallback("trend", 1, "volume24h"),
    },
    {
      text: currentSort === "fee_tvl_ratio" ? "✓ Fee/TVL" : "Fee/TVL",
      callback_data: encodeCallback("trend", 1, "fee_tvl_ratio"),
    },
  ];

  keyboard.push(sortRow);

  keyboard.push([
    {
      text: "🔄 Refresh",
      callback_data: encodeCallback("refresh", currentPage, currentSort),
    },
  ]);

  return { inline_keyboard: keyboard };
}
