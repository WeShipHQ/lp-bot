import {
  DammV1SearchResponse,
  DammV2PoolResponse,
} from "@/types/trending.types";
import {
  DammV1PoolResponse,
  DlmmPoolResponse,
  MeteoraPoolData,
} from "../types/token.types";


export interface HotPoolItem {
  address: string;
  name: string;
  type: "DLMM" | "DAMM v1" | "DAMM v2";
  tokenASymbol: string;
  tokenBSymbol: string;
  apy: number;
  fee24h: number;
  tvl: number;
  feeTvlRatio?: number;
  isVerified: boolean;
  poolData: MeteoraPoolData;
}

export type PoolSortCriteria = "apy" | "fee24h" | "fee_tvl_ratio";
export type PoolSource = "dlmm" | "dammv1" | "dammv2";

export interface HotPoolFilters {
  sortBy: PoolSortCriteria;
  minTvl: number;
  onlyVerified: boolean;
  includeUnknown: boolean; 
}

export class HotPoolsService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";

  static readonly TOTAL_ITEMS = 25;
  static readonly ITEMS_PER_PAGE = 5;
  static readonly TOTAL_PAGES = 5;

  private readonly defaultFilters: HotPoolFilters = {
    sortBy: "apy",
    minTvl: 50000,
    onlyVerified: true,
    includeUnknown: false,
  };

  // ============
  async getHotPoolsPage(
    source: PoolSource,
    page: number, // 0..4
    filters: Partial<HotPoolFilters> = {}
  ): Promise<HotPoolItem[]> {
    const merged = { ...this.defaultFilters, ...filters };
    const limit = HotPoolsService.ITEMS_PER_PAGE;
    const clampedPage = Math.max(
      0,
      Math.min(page, HotPoolsService.TOTAL_PAGES - 1)
    );

    if (source === "dlmm") {
      return this.getDlmmHotPoolsPaged(clampedPage, limit, merged);
    }
    if (source === "dammv1") {
      return this.getDammV1HotPoolsPaged(clampedPage, limit, merged);
    }
    if (source === "dammv2") {
      return this.getDammV2HotPoolsPaged(clampedPage, limit, merged);
    }
    return [];
  }


  // async getHotPoolsBySource(
  //   source: PoolSource,
  //   filters: Partial<HotPoolFilters> = {}
  // ): Promise<HotPoolItem[]> {
  //   const merged = { ...this.defaultFilters, ...filters };

  //   if (source === "dlmm") {
  //     const raw = await this.getDlmmHotPools(
  //       HotPoolsService.TOTAL_ITEMS,
  //       merged
  //     );
  //     return this.applySortAndTrim(raw, merged);
  //   }
  //   if (source === "dammv1") {
  //     const raw = await this.getDammV1HotPools(
  //       HotPoolsService.TOTAL_ITEMS,
  //       merged
  //     );
  //     return this.applySortAndTrim(raw, merged);
  //   }
  //   if (source === "dammv2") {
  //     const raw = await this.getDammV2HotPools(
  //       HotPoolsService.TOTAL_ITEMS,
  //       merged
  //     );
  //     return this.applySortAndTrim(raw, merged);
  //   }
  //   return [];
  // }

  // private applySortAndTrim(
  //   pools: HotPoolItem[],
  //   filters: HotPoolFilters
  // ): HotPoolItem[] {
  //   const filtered = this.applyFilters(pools, filters);
  //   const sorted = this.sortPools(filtered, filters.sortBy);
  //   return sorted.slice(0, HotPoolsService.TOTAL_ITEMS);
  // }

  // ---------------- DLMM: Phân trang trực tiếp ----------------
  private async getDlmmHotPoolsPaged(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
    try {
      const sortKey =
        filters.sortBy === "fee_tvl_ratio"
          ? "feetvlratio12h"
          : filters.sortBy === "fee24h"
            ? "volume12h"
            : "tvl";

      const url = new URL(`${this.dlmmApiUrl}/pair/all_with_pagination`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("sort_key", sortKey);
      url.searchParams.set("order_by", "desc");
      url.searchParams.set("include_unknown", String(!!filters.includeUnknown));
      url.searchParams.set(
        "hide_low_tvl",
        String(Math.max(0, Math.floor(filters.minTvl || 0)))
      );

      console.log("[HotPools][DLMM] GET", url.toString());

      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(
          `[HotPools] DLMM paged error: ${res.status} ${res.statusText} :: ${txt}`
        );
        return [];
      }

      const json = await res.json();
      const pairs = (json?.pairs ?? []) as DlmmPoolResponse[];

      let items = pairs
        .filter((p: any) => !(p.hide || p.is_blacklisted))
        .map((p) => this.convertDlmmToHotPool(p))
        .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null)
        .filter((p) => this.applyFilters([p], filters).length > 0);

      if (filters.sortBy === "apy") {
        items = items.sort((a, b) => b.apy - a.apy);
      } else if (filters.sortBy === "fee24h") {
        items = items.sort((a, b) => b.fee24h - a.fee24h);
      }

      return items;
    } catch (e) {
      console.error("[HotPools] Error DLMM paged:", e);
      return [];
    }
  }

  // ============ Legacy DLMM ============
  // private async getDlmmHotPools(
  //   limit: number,
  //   filters: HotPoolFilters
  // ): Promise<HotPoolItem[]> {
  //   // Gọi page=0 với limit, đã sort tại server
  //   return this.getDlmmHotPoolsPaged(0, limit, filters);
  // }

  // ---------------- DAMM v1 ----------------
  private static readonly DAMMV1_MAX_PAGE_SIZE = 25;

  private async getDammV1HotPoolsPaged(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
    try {
      const sortKeyApi =
        filters.sortBy === "fee_tvl_ratio"
          ? "fee_tvl_ratio"
          : filters.sortBy === "apy"
            ? "tvl" 
            : "volume"; 

      const url = new URL(`${this.dammV1ApiUrl}/pools/search`);

      url.searchParams.set("page", String(page));
      url.searchParams.set(
        "size",
        String(Math.min(limit, HotPoolsService.DAMMV1_MAX_PAGE_SIZE))
      );
      url.searchParams.set("sort_key", sortKeyApi);
      url.searchParams.set("order_by", "desc");
      url.searchParams.set("unknown", String(!!filters.includeUnknown));
      url.searchParams.set("pool_type", "dynamic");
      url.searchParams.set(
        "hide_low_tvl",
        String(Math.max(0, Math.floor(filters.minTvl || 0)))
      );
      console.log("[HotPools][DAMM v1] GET", url.toString());
      const res = await fetch(url.toString());
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(
          `[HotPools] DAMM v1 paged error: ${res.status} ${res.statusText} :: ${txt}`
        );
        return [];
      }
      const json = (await res.json()) as DammV1SearchResponse;
      const data = json?.data ?? [];

      const items = data
        .map((pool) => this.convertDammV1ToHotPool(pool))
        .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null)
        .filter((p) => this.applyFilters([p], filters).length > 0);

      return this.sortPools(items, filters.sortBy);
    } catch (e) {
      console.error("[HotPools] Error DAMM v1 paged:", e);
      return [];
    }
  }

  // // ============ Legacy DAMM v1 ============
  // private async getDammV1HotPools(
  //   limit: number,
  //   filters: HotPoolFilters
  // ): Promise<HotPoolItem[]> {
  //   return this.getDammV1HotPoolsPaged(0, limit, filters);
  // }

  // ---------------- DAMM v2----------------
  private async getDammV2HotPoolsPaged(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
    try {
      const orderBy =
        filters.sortBy === "apy"
          ? "apr"
          : filters.sortBy === "fee24h"
            ? "fee24h"
            : "fee_tvl_ratio";

      const params = new URLSearchParams();
      params.set("order_by", orderBy);
      params.set("order", "desc");
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));
      if (filters.onlyVerified) params.set("tokens_verified", "true");

      const url = `${this.dammV2ApiUrl}/pools?${params.toString()}`;

      console.log("[HotPools][DAMM v2] GET", url);
      const res = await fetch(url);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(
          `[HotPools] DAMM v2 paged error: ${res.status} ${res.statusText} :: ${txt}`
        );
        return [];
      }

      const json = (await res.json()) as DammV2PoolResponse;
      const list = (json as any)?.data ?? [];

      return (list as any[])
        .map((pool) => this.convertDammV2ToHotPool(pool as any))
        .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null)
        .filter((p) => this.applyFilters([p], filters).length > 0);
    } catch (e) {
      console.error("[HotPools] Error DAMM v2 paged:", e);
      return [];
    }
  }

  // ============ Legacy DAMM v2 ============
  // private async getDammV2HotPools(
  //   limit: number,
  //   filters: HotPoolFilters
  // ): Promise<HotPoolItem[]> {
  //   return this.getDammV2HotPoolsPaged(0, limit, filters);
  // }

  // ---------------- Converters ----------------
  private convertDlmmToHotPool(pool: DlmmPoolResponse): HotPoolItem | null {
    try {
      const poolData = this.mapDlmmToMeteoraPoolData(pool);
      const [aSym, bSym] = (pool.name || "").split("-").map((s) => s?.trim());

      const fees24h = pool.fees_24h ?? 0;
      const ratio24h =
        pool.fee_tvl_ratio?.hour_24 ?? pool.fee_tvl_ratio?.hour_12 ?? 0;

      // đang tính TVL từ fees/ratio (USD)
      const tvlUsd = ratio24h > 0 ? fees24h / ratio24h : 0;

      return {
        address: pool.address,
        name: pool.name,
        type: "DLMM",
        tokenASymbol: aSym || "TOKEN_A",
        tokenBSymbol: bSym || "TOKEN_B",
        apy: (pool.apy ?? pool.apr ?? 0) as number,
        fee24h: fees24h,
        tvl: tvlUsd, 
        feeTvlRatio:
          pool.fee_tvl_ratio?.hour_24 ?? pool.fee_tvl_ratio?.hour_12 ?? 0,
        isVerified: !!pool.is_verified,
        poolData,
      };
    } catch (e) {
      console.error("[HotPools] Error converting DLMM pool:", e);
      return null;
    }
  }

  private convertDammV1ToHotPool(pool: DammV1PoolResponse): HotPoolItem | null {
    try {
      const poolData = this.mapDammV1ToMeteoraPoolData(pool);
      const [aSym, bSym] = (pool.pool_name || "")
        .split("-")
        .map((s) => s?.trim());
      return {
        address: pool.pool_address,
        name: pool.pool_name,
        type: "DAMM v1",
        tokenASymbol: aSym || "TOKEN_A",
        tokenBSymbol: bSym || "TOKEN_B",
        apy: parseFloat(pool.weekly_trade_apy || pool.trade_apy || "0"),
        fee24h: pool.fee_volume,
        tvl: parseFloat(pool.pool_tvl),
        feeTvlRatio: undefined,
        isVerified: true,
        poolData,
      };
    } catch (e) {
      console.error("[HotPools] Error converting DAMM v1 pool:", e);
      return null;
    }
  }

  private convertDammV2ToHotPool(pool: DammV2PoolResponse): HotPoolItem | null {
    try {
      const poolData = this.mapDammV2ToMeteoraPoolData(pool);
      return {
        address: (pool as any).pool_address,
        name: (pool as any).pool_name,
        type: "DAMM v2",
        tokenASymbol: (pool as any).token_a_symbol || "TOKEN_A",
        tokenBSymbol: (pool as any).token_b_symbol || "TOKEN_B",
        apy: (pool as any).apr ?? 0,
        fee24h: (pool as any).fee24h ?? 0,
        tvl: (pool as any).tvl ?? 0,
        feeTvlRatio: (pool as any).fee_tvl_ratio ?? 0,
        isVerified: !!(pool as any).tokens_verified,
        poolData,
      };
    } catch (e) {
      console.error("[HotPools] Error converting DAMM v2 pool:", e);
      return null;
    }
  }

  // ---------------- Mappers to MeteoraPoolData ----------------
  private mapDlmmToMeteoraPoolData(d: DlmmPoolResponse): MeteoraPoolData {
    return {
      pool_address: d.address,
      pool_name: d.name,
      creator: "",
      token_a_mint: d.mint_x,
      token_b_mint: d.mint_y,
      token_a_vault: d.reserve_x as any,
      token_b_vault: d.reserve_y as any,
      token_a_symbol: (d.name?.split("-")[0] || "TOKEN_A") as string,
      token_b_symbol: (d.name?.split("-")[1] || "TOKEN_B") as string,
      alpha_vault: "",
      sqrt_min_price: "0",
      sqrt_max_price: "0",
      min_price: "0",
      max_price: "0",
      liquidity: d.liquidity,
      permanent_lock_liquidity: "0",
      sqrt_price: Math.sqrt(d.current_price ?? 0),
      token_a_amount: d.reserve_x_amount ?? 0,
      token_b_amount: d.reserve_y_amount ?? 0,
      token_a_amount_usd: (d.reserve_x_amount ?? 0) * (d.current_price ?? 0),
      token_b_amount_usd: d.reserve_y_amount ?? 0,
      pool_price: d.current_price ?? 0,
      virtual_price: 0,
      pool_type: 3,
      created_at_slot: 0,
      created_at_slot_timestamp: 0,
      updated_at: Date.now(),
      tvl:
        (d.reserve_x_amount ?? 0) * (d.current_price ?? 0) +
        (d.reserve_y_amount ?? 0),
      apr: d.apr ?? d.apy ?? 0,
      fee_tvl_ratio: d.fee_tvl_ratio?.hour_12 ?? d.fee_tvl_ratio?.hour_24 ?? 0,
      fee24h: d.fees_24h ?? 0,
      volume24h: d.trade_volume_24h ?? 0,
      base_fee: parseFloat((d as any).base_fee_percentage ?? "0"),
      dynamic_fee: 0,
      fee_scheduler_mode: 0,
      collect_fee_mode: 0,
      launchpad: (d as any).launchpad,
      tokens_verified: !!d.is_verified,
      has_farm: (d as any).farm_apr > 0,
      farm_active: (d as any).farm_apr > 0,
    };
  }

  private mapDammV1ToMeteoraPoolData(d: DammV1PoolResponse): MeteoraPoolData {
    const tokens = (d.pool_name || "").split("-");
    return {
      pool_address: d.pool_address,
      pool_name: d.pool_name,
      creator: "",
      token_a_mint: d.pool_token_mints[0] || "",
      token_b_mint: d.pool_token_mints[1] || "",
      token_a_vault: "",
      token_b_vault: "",
      token_a_symbol: tokens[0] || "TOKEN_A",
      token_b_symbol: tokens[1] || "TOKEN_B",
      alpha_vault: "",
      sqrt_min_price: "0",
      sqrt_max_price: "0",
      min_price: "0",
      max_price: "0",
      liquidity: "0",
      permanent_lock_liquidity: "0",
      sqrt_price: 0,
      token_a_amount: parseFloat(d.pool_token_amounts[0] || "0"),
      token_b_amount: parseFloat(d.pool_token_amounts[1] || "0"),
      token_a_amount_usd: parseFloat(d.pool_token_usd_amounts[0] || "0"),
      token_b_amount_usd: parseFloat(d.pool_token_usd_amounts[1] || "0"),
      pool_price: 0,
      virtual_price: 0,
      pool_type: 1,
      created_at_slot: d.created_at,
      created_at_slot_timestamp: d.created_at,
      updated_at: Date.now(),
      tvl: parseFloat(d.pool_tvl),
      apr: parseFloat(d.trade_apy || "0"),
      fee_tvl_ratio: 0,
      fee24h: d.fee_volume,
      volume24h: d.trading_volume,
      base_fee: parseFloat(d.total_fee_pct || "0"),
      dynamic_fee: 0,
      fee_scheduler_mode: 0,
      collect_fee_mode: 0,
      launchpad: null,
      tokens_verified: true,
      has_farm: d.farming_pool !== "",
      farm_active: d.farming_pool !== "" && !d.farm_expire,
    };
  }

  private mapDammV2ToMeteoraPoolData(d: DammV2PoolResponse): MeteoraPoolData {
    const anyD = d as any;
    return {
      pool_address: anyD.pool_address,
      pool_name: anyD.pool_name,
      creator: anyD.creator,
      token_a_mint: anyD.token_a_mint,
      token_b_mint: anyD.token_b_mint,
      token_a_vault: anyD.token_a_vault,
      token_b_vault: anyD.token_b_vault,
      token_a_symbol: anyD.token_a_symbol,
      token_b_symbol: anyD.token_b_symbol,
      alpha_vault: anyD.alpha_vault,
      sqrt_min_price: anyD.sqrt_min_price,
      sqrt_max_price: anyD.sqrt_max_price,
      min_price: anyD.min_price,
      max_price: anyD.max_price,
      liquidity: anyD.liquidity,
      permanent_lock_liquidity: anyD.permanent_lock_liquidity,
      sqrt_price: anyD.sqrt_price,
      token_a_amount: anyD.token_a_amount,
      token_b_amount: anyD.token_b_amount,
      token_a_amount_usd: anyD.token_a_amount_usd,
      token_b_amount_usd: anyD.token_b_amount_usd,
      pool_price: anyD.pool_price,
      virtual_price: anyD.virtual_price,
      pool_type: anyD.pool_type,
      created_at_slot: anyD.created_at_slot,
      created_at_slot_timestamp: anyD.created_at_slot_timestamp,
      updated_at: anyD.updated_at,
      tvl: anyD.tvl,
      apr: anyD.apr,
      fee_tvl_ratio: anyD.fee_tvl_ratio,
      fee24h: anyD.fee24h,
      volume24h: anyD.volume24h,
      base_fee: anyD.base_fee,
      dynamic_fee: anyD.dynamic_fee,
      fee_scheduler_mode: anyD.fee_scheduler_mode,
      collect_fee_mode: anyD.collect_fee_mode,
      launchpad: anyD.launchpad,
      tokens_verified: anyD.tokens_verified,
      has_farm: anyD.has_farm,
      farm_active: anyD.farm_active,
    };
  }

  // ---------------- Filters & sort ----------------
  private applyFilters(
    pools: HotPoolItem[],
    filters: HotPoolFilters
  ): HotPoolItem[] {
    return pools.filter((pool) => {
      if (!isFinite(pool.tvl) || pool.tvl <= 0) return false;
      if (pool.tvl < filters.minTvl) return false;
      if (filters.onlyVerified && !pool.isVerified) return false;
      return true;
    });
  }

  private sortPools(
    pools: HotPoolItem[],
    sortBy: PoolSortCriteria
  ): HotPoolItem[] {
    return pools.sort((a, b) => {
      switch (sortBy) {
        case "apy":
          return b.apy - a.apy;
        case "fee24h":
          return b.fee24h - a.fee24h;
        case "fee_tvl_ratio":
          return (b.feeTvlRatio || 0) - (a.feeTvlRatio || 0);
        default:
          return b.apy - a.apy;
      }
    });
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
