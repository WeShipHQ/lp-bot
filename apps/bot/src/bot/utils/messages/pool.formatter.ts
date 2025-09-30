import { Pool } from "@/types/pool.types";
import { BaseFormatter } from "./base.formatter";
import {
  formatAPR,
  formatNumber,
  formatPercentage,
  formatPrice,
} from "../formatters";
import { TrendingPoolsSortCriteria } from "@/types/trending.types";
import { link } from "../text-formatters";
import { getPoolLink } from "../misc";

export class PoolsFormatter extends BaseFormatter {
  static formatTrendingPoolsMessage(
    pools: Pool[],
    sortBy: TrendingPoolsSortCriteria,
    currentPage: number,
    totalPages: number
  ): string {
    const sortCriteria = sortBy;
    const page = currentPage;
    const totalPage = totalPages;

    const poolLines = pools.map((pool, index) => {
      const apy = formatAPR(pool.apy, { cap: 10000 });

      const fee24h = formatPrice(pool.fees.hour24 || 0, { maxDecimals: 3 });
      const tvl = formatPrice(Number(pool.tvl || 0), { maxDecimals: 3 });
      const volume24h = formatPrice(pool.volume.hour24 || 0, {
        maxDecimals: 3,
      });
      const feeTvlRatio = pool.feeTvlRatio
        ? formatPercentage(pool.feeTvlRatio.hour24 * 100, { decimals: 4 })
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

      return `${link(`/${displayIndex} ${pool.name.toUpperCase()}`, getPoolLink("pandalpbot", pool.address))} \n ${displayData}`;
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
}
