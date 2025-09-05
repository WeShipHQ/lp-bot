import { HotPoolItem } from "@/types/trending.types";
import { DammV1Source } from "./hot-pools/sources/dammv1";
import { DammV2Source } from "./hot-pools/sources/dammv2";
import { DlmmSource } from "./hot-pools/sources/dlmm";
import { HotPoolFilters, PoolSource } from "./hot-pools/types";
import {
  formatAPR,
  formatMarketCap,
  formatPrice,
} from "@/bot/utils/formatters";

export class HotPoolsService {
  private dlmm = new DlmmSource();
  private dammv1 = new DammV1Source();
  private dammv2 = new DammV2Source();

  static readonly TOTAL_ITEMS = 25;
  static readonly ITEMS_PER_PAGE = 10;
  static readonly TOTAL_PAGES = 5;

  private readonly defaultFilters: HotPoolFilters = {
    sortBy: "tvl",
    minTvl: 5000,
    onlyVerified: true,
    includeUnknown: false,
  };

  async getHotPoolsPage(
    source: PoolSource,
    page: number,
    filters: Partial<HotPoolFilters> = {}
  ): Promise<HotPoolItem[]> {
    const merged = { ...this.defaultFilters, ...filters };
    const clampedPage = Math.max(
      0,
      Math.min(page, HotPoolsService.TOTAL_PAGES - 1)
    );
    const limit = HotPoolsService.ITEMS_PER_PAGE;

    switch (source) {
      case "dlmm":
        return this.dlmm.getPage(clampedPage, limit, merged);
      case "dammv1":
        return this.dammv1.getPage(clampedPage, limit, merged);
      case "dammv2":
        return this.dammv2.getPage(clampedPage, limit, merged);
      default:
        return [];
    }
  }

  formatPoolForDisplay(pool: HotPoolItem, index: number): string {
    const apy = formatAPR(pool.apy);
    const fee24h = formatPrice(pool.fee24h, {
      compact: true,
      maxDecimals: 2,
    });
    const tvl = formatMarketCap(pool.tvl);
    return `${index + 1}) ${pool.tokenASymbol}/${pool.tokenBSymbol} | APY: ${apy} | Fee24h: ${fee24h} | TVL: ${tvl}`;
  }
}

export const hotPoolsService = new HotPoolsService();
