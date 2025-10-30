import { MessageInlineButton, MessageInlineKeyboard } from "@/domain/message";
import { TrendingPoolsSortCriteria } from "@/v2";

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
): MessageInlineKeyboard {
  const keyboard: MessageInlineButton[][] = [];

  const navRow: MessageInlineButton[] = [];

  if (currentPage > 1) {
    navRow.push({
      text: "◀️ Prev",
      callbackData: encodeTrendingCallback("prev", currentPage - 1, currentSort),
    });
  }

  navRow.push({
    text: `📄 ${currentPage}/${totalPages}`,
    callbackData: encodeTrendingCallback("noop", currentPage, currentSort),
  });

  if (currentPage < totalPages) {
    navRow.push({
      text: "Next ▶️",
      callbackData: encodeTrendingCallback("next", currentPage + 1, currentSort),
    });
  }

  keyboard.push(navRow);

  const sortRow: MessageInlineButton[] = [
    {
      text: currentSort === "apy" ? "✓ APY" : "APY",
      callbackData: encodeTrendingCallback("sort", 1, "apy"),
    },
    {
      text: currentSort === "tvl" ? "✓ TVL" : "TVL",
      callbackData: encodeTrendingCallback("sort", 1, "tvl"),
    },
    {
      text: currentSort === "volume24h" ? "✓ 24h Vol" : "24h Vol",
      callbackData: encodeTrendingCallback("sort", 1, "volume24h"),
    },
    {
      text: currentSort === "fee_tvl_ratio" ? "✓ Fee/TVL" : "Fee/TVL",
      callbackData: encodeTrendingCallback("sort", 1, "fee_tvl_ratio"),
    },
  ];

  keyboard.push(sortRow);

  keyboard.push([
    {
      text: "🔄 Refresh",
      callbackData: encodeTrendingCallback("refresh", currentPage, currentSort),
    },
  ]);

  return {
    type: "inline",
    rows: keyboard,
  };
}
