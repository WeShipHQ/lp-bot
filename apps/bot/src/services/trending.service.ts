import { meteoraService } from "./meteora.service";
import { dexscreenerService } from "./dexscreener.service";
import {
  PairItem,
  TrendingItem,
  TrendingPageState,
} from "../types/trending.types";
import { TRENDING_CONSTANTS } from "@/constants/trending.constants";

function guessSymbol(name: string, mint: string) {
  const p = name?.split("-") || [];
  return p.length >= 2 ? p[0].trim() : mint.slice(0, 4).toUpperCase();
}
function vol12h(p: PairItem) {
  return p.volume?.hour_12 ?? p.trade_volume_24h ?? 0;
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
    const pairs = await meteoraService.fetchPairsPage(
      apiPage,
      TRENDING_CONSTANTS.DEFAULT_LIMIT,
      "volume12h"
    );

    let items: TrendingItem[] = pairs.map((p) => ({
      mint: p.mint_x,
      symbol: guessSymbol(p.name, p.mint_x),
      totalVol12h: vol12h(p),
      bestPool: p,
    }));

    const mints = items.map((i) => i.mint);
    const ds = await dexscreenerService.fetchMultipleTokensInfo(mints);
    items = items.map((i) => {
      const pair = ds.get(i.mint)?.pairs?.[0];
      return {
        ...i,
        mcap: pair?.marketCap ?? pair?.fdv ?? null,
        vol24h_ds: pair?.volume?.h24 ?? null,
        dexs_url: pair?.url,
      };
    });

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

      const mcapVal = fmt(it.mcap ?? null);
      const vol12Val = fmt(it.totalVol12h);

      const mcapStr = `Mcap: *${mcapVal}*`;
      const volStr = `Volume 12h: *${vol12Val}*`;

      // SYMBOL LINK
      const title = it.dexs_url
        ? `[/${pos} ${it.symbol}](${it.dexs_url})`
        : `/${pos} ${it.symbol}`;

      // DEX LINK
      const dexLink = it.dexs_url ? `[Dex](${it.dexs_url})` : "Dex: N/A";

      return `${title} | ${mcapStr} | ${volStr} | ${dexLink}`;
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
      `💡 Click on the symbol link to access token details. Page ${page}`,
    ].join("\n");
  }
}

export const trendingService = new TrendingService();
