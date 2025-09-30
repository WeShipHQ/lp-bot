import {
  TrendingPoolsSortCriteria,
  PoolTrendingItem,
  TrendingPageState,
  PaginatedTrendingPools,
} from "@/types/trending.types";
import { HotPoolsService, hotPoolsService } from "./hot-pools.service";
import { PoolSortCriteria, PoolSource } from "./hot-pools/types";
import {
  formatNumber,
  formatPercentage,
  formatAPR,
} from "@/bot/utils/formatters";
import { Pool } from "@/types/pool.types";
import { SarosPoolService } from "./saros/pool.service";
import { SarosAdapter } from "./saros/saros.adapter";
import { TRENDING_CONSTANTS } from "@/bot/constants/trending.constants";

export class TrendingService {
  private readonly pageStates = new Map<number, TrendingPageState>();
  private readonly sarosPoolService = new SarosPoolService();

  async loadHotPoolsPage(
    chatId: number,
    apiPage = 0,
    sortCriteria: PoolSortCriteria = "tvl",
    poolSource: "dlmm" | "dammv1" | "dammv2" = "dlmm"
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

    const poolItems: PoolTrendingItem[] = pools.map((pool) => {
      const volume24hValue = (pool as any).volume24h || 0;

      return {
        poolAddress: pool.address,
        poolName: pool.name,
        poolType: pool.type,
        tokenPair: `${pool.tokenASymbol}/${pool.tokenBSymbol}`,
        apy: pool.apy,
        fee24h: pool.fee24h,
        tvl: pool.tvl,
        feeTvlRatio: pool.feeTvlRatio,
        volume24h: volume24hValue,
        isVerified: pool.isVerified,
      };
    });

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

  async getTrendingPool(
    currentPage: number,
    sortBy: TrendingPoolsSortCriteria
  ): Promise<PaginatedTrendingPools> {
    const sarosPools = await this.sarosPoolService.getAllDlmmPools({
      page: currentPage,
      size: TRENDING_CONSTANTS.PAGE_SIZE,
      orderBy:
        sortBy === "apy" || sortBy === "fee_tvl_ratio"
          ? "volume24h"
          : sortBy === "tvl"
            ? "totalLiquidity"
            : "volume24h",
      order: "desc",
    });
    const pools = SarosAdapter.dlmmPoolsToPoolArray(sarosPools.data.data || []);

    return {
      pools,
      currentPage: sarosPools.data.currentPage,
      totalPages: sarosPools.data.total || 0,
      sortBy,
    };
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

    // Using imported formatting functions

    const poolLines = poolItems.map((pool, index) => {
      // Use the imported formatting functions with appropriate options
      const apy = formatAPR(pool.apy, { cap: 10000 });
      // Add $ prefix to monetary values
      const fee24h =
        "$" + formatNumber(pool.fee24h || 0, { useSuffixes: true });
      const tvl = "$" + formatNumber(pool.tvl || 0, { useSuffixes: true });
      const volume24h =
        "$" + formatNumber(pool.volume24h || 0, { useSuffixes: true });
      const feeTvlRatio = pool.feeTvlRatio
        ? formatPercentage(pool.feeTvlRatio * 100, { decimals: 4 })
        : "N/A";
      const displayIndex = (page - 1) * 5 + index + 1;

      // Show different data based on sort criteria
      let displayData: string;
      if (sortCriteria === "tvl") {
        displayData = `TVL: *${tvl}* | APY: *${apy}* | Fee24h: *${fee24h}*`;
      } else if (sortCriteria === "volume24h") {
        displayData = `24h Vol: *${volume24h}* | TVL: *${tvl}* | APY: *${apy}*`;
      } else if (sortCriteria === "fee_tvl_ratio") {
        displayData = `Fee/TVL: *${feeTvlRatio}* | TVL: *${tvl}* | APY: *${apy}*`;
      } else {
        // Default to APY
        displayData = `APY: *${apy}* | Fee24h: *${fee24h}* | TVL: *${tvl}*`;
      }

      return `/${displayIndex}${pool.tokenPair.replace("/", "")} ${displayData}`;
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
          : sortCriteria === "tvl"
            ? "TVL"
            : sortCriteria === "volume24h"
              ? "24h Vol"
              : sortCriteria.toUpperCase()
      }. Page ${page}/${HotPoolsService.TOTAL_PAGES}`,
      "",
      "_Tap on the commands above to view pool details_",
      "",
    ].join("\n");
  }
}

export const trendingService = new TrendingService();
