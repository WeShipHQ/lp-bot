import { TrendingPoolsSortCriteria } from "@/v2";
import { InlineKeyboardButton } from "@telegraf/types";
import { InlineKeyboardMarkup } from "telegraf/types";

const PREFIX = "trending" as const;

type TrendingAction = "prev" | "next" | "refresh" | "sort" | "noop";

function encodeTrendingCallback(
  action: TrendingAction,
  page: number,
  sort: TrendingPoolsSortCriteria
): string {
  return `${PREFIX}:${action}:${page}:${sort}`;
}

export function getTrendingKeyboard(
  currentPage: number,
  currentSort: TrendingPoolsSortCriteria,
  totalPages: number
): InlineKeyboardMarkup {
  const keyboard: InlineKeyboardButton[][] = [];

  const navRow: InlineKeyboardButton[] = [];

  if (currentPage > 1) {
    navRow.push({
      text: "◀️ Prev",
      callback_data: encodeTrendingCallback("prev", currentPage - 1, currentSort),
    });
  }

  navRow.push({
    text: `📄 ${currentPage}/${totalPages}`,
    callback_data: encodeTrendingCallback("noop", currentPage, currentSort),
  });

  if (currentPage < totalPages) {
    navRow.push({
      text: "Next ▶️",
      callback_data: encodeTrendingCallback("next", currentPage + 1, currentSort),
    });
  }

  keyboard.push(navRow);

  const sortRow: InlineKeyboardButton[] = [
    {
      text: currentSort === "apy" ? "✓ APY" : "APY",
      callback_data: encodeTrendingCallback("sort", 1, "apy"),
    },
    {
      text: currentSort === "tvl" ? "✓ TVL" : "TVL",
      callback_data: encodeTrendingCallback("sort", 1, "tvl"),
    },
    {
      text: currentSort === "volume24h" ? "✓ 24h Vol" : "24h Vol",
      callback_data: encodeTrendingCallback("sort", 1, "volume24h"),
    },
    {
      text: currentSort === "fee_tvl_ratio" ? "✓ Fee/TVL" : "Fee/TVL",
      callback_data: encodeTrendingCallback("sort", 1, "fee_tvl_ratio"),
    },
  ];

  keyboard.push(sortRow);

  keyboard.push([
    {
      text: "🔄 Refresh",
      callback_data: encodeTrendingCallback("refresh", currentPage, currentSort),
    },
  ]);

  return { inline_keyboard: keyboard };
}
