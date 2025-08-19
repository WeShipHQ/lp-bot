import { TRENDING_CONSTANTS } from "@/bot/constants/trending.constants";
import { PairItem, TrendingItem, TrendingPageState } from "@/types/trending.types";
import { meteoraTrendingService } from "./meteora-trending.service";


function guessSymbol(name: string, mint: string) {
  const p = name?.split("-") || [];
  return p.length >= 2 ? p[0].trim() : mint.slice(0, 4).toUpperCase();
}
function vol12h(p: PairItem) {
  return p.volume?.hour_12 ?? 0;
}
function fmt(n?: number | null) {
  if (n == null) return "N/A";
  const v = Math.abs(n);
  if (v >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

export class TrendingService {
  private readonly pageStates = new Map<number, TrendingPageState>();

  async loadApiPage(chatId: number, apiPage = 0): Promise<TrendingItem[]> {
    const pairs = await meteoraTrendingService.fetchPairsPage(
      apiPage,
      TRENDING_CONSTANTS.DEFAULT_LIMIT,
      "volume12h"
    );

    const items: TrendingItem[] = pairs.map((p) => ({
      mint: p.mint_x,
      symbol: guessSymbol(p.name, p.mint_x),
      totalVol12h: vol12h(p),
      bestPool: p,
    }));

    const st =
      this.pageStates.get(chatId) ||
      ({ items: [], page: 1 } as TrendingPageState);
    st.items = items;
    st.page = apiPage + 1;
    st.apiPage = apiPage;
    this.pageStates.set(chatId, st);

    return items;
  }

  setMessageId(chatId: number, messageId: number) {
    const st = this.pageStates.get(chatId) || { items: [], page: 1 };
    st.messageId = messageId;
    this.pageStates.set(chatId, st);
  }

  getState(chatId: number) {
    return this.pageStates.get(chatId) || null;
  }

  formatPage(items: TrendingItem[], page: number): string {
    const lines = items.map((it, idx) => {
      const pos = (page - 1) * TRENDING_CONSTANTS.DEFAULT_LIMIT + idx + 1;

      const vol12Val = fmt(it.totalVol12h);
      const volStr = `Volume 12h: *${vol12Val}*`;

      const title = `/${pos} ${it.symbol}`;

      return `${title} | ${volStr}`;
    });

    const spacedLines: string[] = [];
    lines.forEach((line, i) => {
      spacedLines.push(line);
      if (i < lines.length - 1) spacedLines.push("");
    });

    return [
      "Enter CA or meteora link in bot chat or choose a token from the below trending list:",
      "",
      ...spacedLines,
      "",
      `💡 Trending tokens by 12h volume. Page ${page}`,
    ].join("\n");
  }
}

export const trendingService = new TrendingService();
