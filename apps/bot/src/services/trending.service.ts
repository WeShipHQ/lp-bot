import { PoolTrendingItem, TrendingPageState } from "@/types/trending.types";
import { HotPoolsService, hotPoolsService } from "./hot-pools.service";
import { PoolSortCriteria, PoolSource } from "./hot-pools/types";
import { getPoolStartCommand } from "@/utils/link";
import {
  formatAPR,
  formatMarketCap,
  formatPrice,
} from "@/bot/utils/formatters";

export class TrendingService {
  private readonly pageStates = new Map<number, TrendingPageState>();

  async loadHotPoolsPage(
    chatId: number,
    apiPage = 0,
    sortCriteria: PoolSortCriteria = "apy",
    poolSource: PoolSource = "dlmm"
  ): Promise<PoolTrendingItem[]> {
    const clampedPage = Math.max(
      0,
      Math.min(apiPage, HotPoolsService.TOTAL_PAGES - 1)
    );

    const pools = await hotPoolsService.getHotPoolsPage(
      poolSource,
      clampedPage,
      {
        sortBy: sortCriteria,
        minTvl: 50000,
        onlyVerified: true,
        includeUnknown: false,
      }
    );

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

    const pageState =
      this.pageStates.get(chatId) ||
      ({ items: [], page: 1 } as TrendingPageState);

    pageState.poolItems = poolItems;
    pageState.page = clampedPage + 1;
    pageState.apiPage = clampedPage;
    pageState.displayMode = "pools";
    pageState.sortBy = sortCriteria;
    pageState.poolSource = poolSource;
    pageState.totalPages = HotPoolsService.TOTAL_PAGES;

    this.pageStates.set(chatId, pageState);

    return poolItems;
  }

  setMessageId(chatId: number, messageId: number) {
    const pageState = this.pageStates.get(chatId) || {
      items: [],
      page: 1,
      displayMode: "pools" as const,
    };
    pageState.messageId = messageId;
    this.pageStates.set(chatId, pageState);
  }

  getState(chatId: number) {
    return this.pageStates.get(chatId) || null;
  }

  formatPoolPage(
    poolItems: PoolTrendingItem[],
    page: number,
    poolSource: PoolSource,
    sortCriteria: PoolSortCriteria
  ): string {
    if (!poolItems || poolItems.length === 0) {
      return [
        `🔥 *Hot Pools - ${poolSource.toUpperCase()}*`,
        "",
        "No pools found. Try another source or sort option.",
      ].join("\n");
    }

    const formatCurrency = (value?: number | null) => {
      if (value == null) return "N/A";
      const absoluteValue = Math.abs(value);
      if (absoluteValue >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
      if (absoluteValue >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
      if (absoluteValue >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
      return `$${value.toFixed(2)}`;
    };

    const formatPercentage = (value: number) => `${value.toFixed(2)}%`;

    const poolLines = poolItems.map((pool, index) => {
      const apy = formatPercentage(pool.apy);
      const fee24h = formatCurrency(pool.fee24h);
      const tvl = formatCurrency(pool.tvl);
      const displayIndex = (page - 1) * 5 + index + 1;

      return `/${displayIndex} ${pool.tokenPair} APY: *${apy}* | Fee24h: *${fee24h}* | TVL: *${tvl}*`;
    });

    const spacedLines: string[] = [];
    poolLines.forEach((line, index) => {
      spacedLines.push(line);
      if (index < poolLines.length - 1) spacedLines.push("");
    });

    return [
      `🔥 *Hot Pools - ${poolSource.toUpperCase()}*`,
      "",
      "Choose a pool from the trending list below:",
      "",
      ...spacedLines,
      "",
      `💡 Sorted by ${
        sortCriteria === "fee_tvl_ratio"
          ? "Fee/TVL Ratio"
          : sortCriteria.toUpperCase()
      }. Page ${page}/${HotPoolsService.TOTAL_PAGES}`,
      "",
    ].join("\n");
  }
}

export const trendingService = new TrendingService();
