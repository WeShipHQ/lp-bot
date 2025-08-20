import { PoolTrendingItem, TrendingPageState } from "@/types/trending.types";
import {
  HotPoolsService,
  hotPoolsService,
  PoolSortCriteria,
  PoolSource,
} from "./hot-pools.service";

export class TrendingService {
  private readonly pageStates = new Map<number, TrendingPageState>();

  async loadHotPoolsPage(
    chatId: number,
    apiPage = 0,
    sortBy: PoolSortCriteria = "apy",
    source: PoolSource = "dlmm"
  ): Promise<PoolTrendingItem[]> {
    const clamped = Math.max(
      0,
      Math.min(apiPage, HotPoolsService.TOTAL_PAGES - 1)
    );

    const pools = await hotPoolsService.getHotPoolsPage(source, clamped, {
      sortBy,
      minTvl: 50000,
      onlyVerified: true,
      includeUnknown: false,
    });

    const poolItems: PoolTrendingItem[] = pools.map((pool) => ({
      poolAddress: pool.address,
      poolName: pool.name,
      poolType: pool.type,
      tokenPair: `${pool.tokenASymbol}/${pool.tokenBSymbol}`,
      apy: pool.apy,
      fee24h: pool.fee24h,
      tvl: pool.tvl,
      feeTvlRatio: pool.feeTvlRatio,
      isVerified: pool.isVerified,
    }));

    const st =
      this.pageStates.get(chatId) ||
      ({ items: [], page: 1 } as TrendingPageState);

    st.poolItems = poolItems;
    st.page = clamped + 1;
    st.apiPage = clamped;
    st.displayMode = "pools";
    st.sortBy = sortBy;
    st.poolSource = source;
    st.totalPages = HotPoolsService.TOTAL_PAGES;
    this.pageStates.set(chatId, st);

    return poolItems;
  }

  setMessageId(chatId: number, messageId: number) {
    const st = this.pageStates.get(chatId) || {
      items: [],
      page: 1,
      displayMode: "pools" as const,
    };
    st.messageId = messageId;
    this.pageStates.set(chatId, st);
  }

  getState(chatId: number) {
    return this.pageStates.get(chatId) || null;
  }

  formatPoolPage(
    poolItems: PoolTrendingItem[],
    page: number,
    source: PoolSource,
    sortBy: PoolSortCriteria
  ): string {
    if (!poolItems || poolItems.length === 0) {
      return [
        `🔥 *Hot Pools - ${source.toUpperCase()}*`,
        "",
        "No pools found. Try another source or sort.",
      ].join("\n");
    }

    const fmt = (n?: number | null) => {
      if (n == null) return "N/A";
      const v = Math.abs(n);
      if (v >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
      if (v >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
      if (v >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
      return `$${n.toFixed(2)}`;
    };
    const fmtPercent = (n: number) => `${n.toFixed(2)}%`;

    const lines = poolItems.map((pool, idx) => {
      const apy = fmtPercent(pool.apy);
      const fee24h = fmt(pool.fee24h);
      const tvl = fmt(pool.tvl);
      return `${(page - 1) * 5 + idx + 1}) ${pool.tokenPair} APY: *${apy}* | Fee24h: *${fee24h}* | TVL: *${tvl}*`;
    });

    const spaced: string[] = [];
    lines.forEach((l, i) => {
      spaced.push(l);
      if (i < lines.length - 1) spaced.push("");
    });

    return [
      `🔥 *Hot Pools - ${source.toUpperCase()}*`,
      "",
      "Choose a pool from the trending list below:",
      "",
      ...spaced,
      "",
      `💡 Sorted by ${sortBy === "fee_tvl_ratio" ? "Fee/TVL Ratio" : sortBy.toUpperCase()}. Page ${page}/${HotPoolsService.TOTAL_PAGES}`,
      "",
    ].join("\n");
  }
}

export const trendingService = new TrendingService();
