import { DammV1SearchResponse } from "@/types/trending.types";
import {
  DammV1PoolResponse,
  HotPoolFilters,
  HotPoolItem,
  MeteoraPoolData,
} from "../types";
import { applyFilters, sortPools } from "../utils";

export class DammV1Source {
  constructor(private readonly baseUrl = "https://damm-api.meteora.ag") {}

  async getPage(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
    const sortKeyApi =
      filters.sortBy === "fee_tvl_ratio"
        ? "fee_tvl_ratio"
        : filters.sortBy === "apy"
          ? "tvl"
          : "volume";

    const url = new URL(`${this.baseUrl}/pools/search`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(Math.min(limit, 25)));
    url.searchParams.set("sort_key", sortKeyApi);
    url.searchParams.set("order_by", "desc");
    url.searchParams.set("unknown", String(!!filters.includeUnknown));
    url.searchParams.set("pool_type", "dynamic");
    url.searchParams.set(
      "hide_low_tvl",
      String(Math.max(0, Math.floor(filters.minTvl || 0)))
    );

    console.log("[DAMM v1] GET", url.toString());

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const json = (await res.json()) as DammV1SearchResponse;
    const data = json?.data ?? [];

    let items = data
      .map((pool) => this.convertToHotPool(pool))
      .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null);

    items = applyFilters(items, filters);

    return sortPools(items, filters.sortBy);
  }

  private convertToHotPool(pool: DammV1PoolResponse): HotPoolItem | null {
    try {
      const [aSym, bSym] = (pool.pool_name || "")
        .split("-")
        .map((s: string) => s?.trim());

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
        poolData: this.mapToPoolData(pool),
      };
    } catch {
      return null;
    }
  }

  private mapToPoolData(d: DammV1PoolResponse): MeteoraPoolData {
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
}
