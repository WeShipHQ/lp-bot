import {
  DlmmPoolResponse,
  HotPoolFilters,
  HotPoolItem,
  MeteoraPoolData,
} from "../types";
import { applyFilters } from "../utils";

export class DlmmSource {
  constructor(private readonly baseUrl = "https://dlmm-api.meteora.ag") {}

  async getPage(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
    const sortKey =
      filters.sortBy === "fee_tvl_ratio"
        ? "feetvlratio" 
        : filters.sortBy === "volume24h"
          ? "volume"
          : filters.sortBy === "tvl"
            ? "tvl" // Use tvl instead of liquidity
            : "tvl"; // Default to tvl since apy is not supported

    const url = new URL(`${this.baseUrl}/pair/all_with_pagination`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("sort_key", sortKey);
    url.searchParams.set("order_by", "desc");
    url.searchParams.set("include_unknown", String(!!filters.includeUnknown));
    url.searchParams.set(
      "hide_low_tvl",
      String(Math.max(0, Math.floor(filters.minTvl || 0)))
    );

    console.log("[DLMM] GET", url.toString());

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // const txt = await res.text().catch(() => "");
      // console.error(`[HotPools] DLMM paged error: ${res.status} ${res.statusText} :: ${txt}`);
      return [];
    }

    const json = await res.json();
    const pairs = (json?.pairs ?? []) as DlmmPoolResponse[];

    let items = pairs
      .filter((p: any) => !(p.hide || p.is_blacklisted))
      .map((p) => this.convertToHotPool(p))
      .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null);

    items = applyFilters(items, filters);

    // Sort based on criteria (API might already sort, but this ensures correct order)
    if (filters.sortBy === "apy") items = items.sort((a, b) => b.apy - a.apy);
    if (filters.sortBy === "tvl") items = items.sort((a, b) => b.tvl - a.tvl);
    if (filters.sortBy === "volume24h")
      items = items.sort(
        (a, b) => (b.poolData?.volume24h || 0) - (a.poolData?.volume24h || 0)
      );
    if (filters.sortBy === "fee_tvl_ratio")
      items = items.sort((a, b) => (b.feeTvlRatio || 0) - (a.feeTvlRatio || 0));

    return items;
  }

  private convertToHotPool(pool: DlmmPoolResponse): HotPoolItem | null {
    try {
      const [aSym, bSym] = (pool.name || "")
        .split("-")
        .map((s: string) => s?.trim());

      const fees24h = pool.fees_24h ?? 0;
      const ratio24h =
        pool.fee_tvl_ratio?.hour_24 ??
        (typeof pool.fee_tvl_ratio === "number" ? pool.fee_tvl_ratio : 0);

      const tvlUsd = pool.liquidity
        ? parseFloat(pool.liquidity)
        : ratio24h > 0
          ? fees24h / ratio24h
          : 0;
      const volume24h = pool.trade_volume_24h ?? 0;

      return {
        address: pool.address,
        name: pool.name,
        type: "DLMM",
        tokenASymbol: aSym || "TOKEN_A",
        tokenBSymbol: bSym || "TOKEN_B",
        apy: (pool.apy ?? pool.apr ?? 0) as number,
        fee24h: fees24h,
        tvl: tvlUsd,
        feeTvlRatio: ratio24h,
        volume24h: volume24h,
        isVerified: !!pool.is_verified,
        poolData: this.mapToPoolData(pool),
      };
    } catch {
      return null;
    }
  }

  private mapToPoolData(d: DlmmPoolResponse): MeteoraPoolData {
    const fee_tvl_ratio =
      typeof d.fee_tvl_ratio === "object"
        ? (d.fee_tvl_ratio?.hour_24 ?? d.fee_tvl_ratio?.hour_12 ?? 0)
        : (d.fee_tvl_ratio ?? 0);

    const liquidity =
      typeof d.liquidity === "string"
        ? parseFloat(d.liquidity)
        : (d.liquidity ?? 0);

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
      liquidity: String(liquidity),
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
      tvl: liquidity,
      apr: d.apr ?? d.apy ?? 0,
      fee_tvl_ratio: fee_tvl_ratio,
      fee24h: d.fees_24h ?? 0,
      volume24h: d.trade_volume_24h ?? 0,
      base_fee: parseFloat((d.base_fee_percentage ?? "0").toString()),
      dynamic_fee: 0,
      fee_scheduler_mode: 0,
      collect_fee_mode: 0,
      launchpad: d.launchpad,
      tokens_verified: !!d.is_verified,
      has_farm: (d.farm_apr ?? 0) > 0,
      farm_active: (d.farm_apr ?? 0) > 0,
    };
  }
}
