import { HotPoolItem } from "@/types/trending.types";
import { DammV1Source } from "./hot-pools/sources/dammv1";
import { DammV2Source } from "./hot-pools/sources/dammv2";
import { DlmmSource } from "./hot-pools/sources/dlmm";
import { HotPoolFilters, PoolSource } from "./hot-pools/types";


export class HotPoolsService {
  private dlmm = new DlmmSource();
  private dammv1 = new DammV1Source();
  private dammv2 = new DammV2Source();

  static readonly TOTAL_ITEMS = 25;
  static readonly ITEMS_PER_PAGE = 5;
  static readonly TOTAL_PAGES = 5;

  private readonly defaultFilters: HotPoolFilters = {
    sortBy: "apy",
    minTvl: 50000,
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
    const apy = `${pool.apy.toFixed(2)}%`;
    const fee24h = this.formatCurrency(pool.fee24h);
    const tvl = this.formatCurrency(pool.tvl);
    return `${index + 1}) ${pool.tokenASymbol}/${pool.tokenBSymbol} | APY: ${apy} | Fee24h: ${fee24h} | TVL: ${tvl}`;
  }

  private formatCurrency(value: number): string {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  }
}

export const hotPoolsService = new HotPoolsService();
