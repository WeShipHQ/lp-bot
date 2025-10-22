import { MessagePayload } from "@/domain/message";
import { getTrendingKeyboard } from "@/presentation/keyboards/trending-menu";
import { UnifiedPool } from "@/shared/types/pool.types";
import { TrendingPoolsSortCriteria } from "@/types/trending.types";
import { getPoolDeeplink, link } from "@/utils/misc";
import { formatAPR, formatCurrency, formatPercentage } from "./base.formatter";
import { createTextMessage } from "./message-builder";

export class PoolFormatter {
  static formatPoolCard(pool: UnifiedPool): string {
    const tokenPair = `${pool.tokenA.symbol}/${pool.tokenB.symbol}`;
    const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
    const apy = `${(pool.apy * 100).toFixed(2)}%`;
    const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
    const feeTvlRatio = pool.feeTvlRatio24h
      ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 })
      : "N/A";

    const header = `*${tokenPair}*`;
    const lines = [
      header,
      `TVL: ${tvl} | APY: ${apy}`,
      `Fee(24h): ${fee24h} | Fee/TVL: ${feeTvlRatio}`,
    ];
    return lines.join("\n");
  }

  static formatPoolDetails(pool: UnifiedPool): string {
    const tokenPair = `${pool.tokenA.symbol.toUpperCase()}/${pool.tokenB.symbol.toUpperCase()}`;
    const poolLink = `[Open](${getPoolDeeplink("pandalpbot", pool.dex, pool.address)})`
    const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
    const apy = `${(pool.apy * 100).toFixed(2)}%`;
    const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
    const feeTvl = pool.feeTvlRatio24h
      ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 })
      : "N/A";
    const vol24h = formatCurrency(pool.volume24h || 0, { maxDecimals: 3 });

    return [
      `*${tokenPair}* | ${poolLink}`,
      "",
      `TVL: ${tvl}`,
      `APY: ${apy}`,
      `Fee (24h): ${fee24h}`,
      `Fee/TVL (24h): ${feeTvl}`,
      `24h Vol: ${vol24h}`,
    ].join("\n");
  }

  static formatTrendingList(
    pools: UnifiedPool[],
    page: number,
    totalPages: number,
    sortBy: string
  ): string {
    const lines: string[] = [];
    pools.forEach((pool, index) => {
      const displayIndex = (page - 1) * pools.length + index + 1;
      const apy = `${(pool.apy * 100).toFixed(2)}%`;
      const tvl = formatCurrency(Number(pool.tvl), { maxDecimals: 3 });
      const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
      const feeTvl = pool.feeTvlRatio24h
        ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 2 })
        : "N/A";
      const line = `/${displayIndex} ${pool.tokenA.symbol}-${pool.tokenB.symbol} | APY: *${apy}* | TVL: *${tvl}* | Fee24h: *${fee24h}* | Fee/TVL: *${feeTvl}*`;
      lines.push(line, "");
    });

    lines.push(`💡 Sorted by ${sortBy}. Page ${page}/${totalPages}`);
    lines.push("");
    lines.push("_Tap a command to view pool details_");

    return ["🔥 *Hot Pools*", "", ...lines].join("\n");
  }

  static formatTrendingPoolsMessage(
    pools: UnifiedPool[],
    sortBy: TrendingPoolsSortCriteria,
    currentPage: number,
    totalPages: number
  ): string {
    const sortCriteria = sortBy;
    const page = currentPage;
    const totalPage = totalPages;

    const poolLines = pools.map((pool, index) => {
      const apy = formatAPR(pool.apy, { cap: 10000 });

      const fee24h = formatCurrency(pool.fees24h || 0, { maxDecimals: 3 });
      const tvl = formatCurrency(Number(pool.tvl || 0), { maxDecimals: 3 });
      const volume24h = formatCurrency(pool.volume24h || 0, {
        maxDecimals: 3,
      });
      const feeTvlRatio = pool.feeTvlRatio24h
        ? formatPercentage(pool.feeTvlRatio24h * 100, { decimals: 4 })
        : "N/A";

      const displayIndex = (page - 1) * 5 + index + 1;

      let displayData: string = "";
      if (sortCriteria === "tvl") {
        displayData = `TVL: *${tvl}* | APY: *${apy}* | Fee24h: *${fee24h}*`;
      } else if (sortCriteria === "volume24h") {
        displayData = `24h Vol: *${volume24h}* | TVL: *${tvl}* | APY: *${apy}*`;
      } else if (sortCriteria === "fee_tvl_ratio") {
        displayData = `Fee/TVL: *${feeTvlRatio}* | TVL: *${tvl}* | APY: *${apy}*`;
      } else {
        displayData = `APY: *${apy}* | Fee24h: *${fee24h}* | TVL: *${tvl}*`;
      }

      return `${link(`/${displayIndex} ${pool.name.toUpperCase()}`, getPoolDeeplink("pandalpbot", pool.dex as any, pool.address))} \n ${displayData}`;
    });

    const spacedLines: string[] = [];
    poolLines.forEach((line, index) => {
      spacedLines.push(line);
      if (index < poolLines.length - 1) spacedLines.push("");
    });

    return [
      `🔥 *Hot Pools*`,
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
      }. Page ${page}/${totalPage}`,
      "",
      "_Tap on the commands above to view pool details_",
      "",
    ].join("\n");
  }

  static createTrendingPoolsPayload(
    pools: UnifiedPool[],
    sortBy: TrendingPoolsSortCriteria,
    currentPage: number,
    totalPages: number
  ): MessagePayload {
    const text = this.formatTrendingPoolsMessage(
      pools,
      sortBy,
      currentPage,
      totalPages
    );

    return createTextMessage("trending.pools", text, {
      parseMode: "markdown",
      disableLinkPreview: true,
      keyboard: getTrendingKeyboard(currentPage, sortBy, totalPages),
    });
  }
}
