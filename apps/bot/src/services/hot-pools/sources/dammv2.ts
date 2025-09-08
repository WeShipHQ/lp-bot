import {
  DammV2PoolResponse,
  HotPoolFilters,
  HotPoolItem,
  MeteoraPoolData,
} from "../types";
import { applyFilters } from "../utils";

export class DammV2Source {
  constructor(private readonly baseUrl = "https://dammv2-api.meteora.ag") {}

  async getPage(
    page: number,
    limit: number,
    filters: HotPoolFilters
  ): Promise<HotPoolItem[]> {
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

    const url = `${this.baseUrl}/pools?${params.toString()}`;
    console.log("[DAMM v2] GET", url);

    const res = await fetch(url);
    if (!res.ok) return [];

    const json = (await res.json()) as DammV2PoolResponse;
    const list = (json as any)?.data ?? [];

    let items = (list as any[])
      .map((p) => this.convertToHotPool(p as any))
      .filter((p: HotPoolItem | null): p is HotPoolItem => p !== null);

    items = applyFilters(items, filters);
    return items;
  }

  private convertToHotPool(pool: any): HotPoolItem | null {
    try {
      return {
        address: pool.pool_address,
        name: pool.pool_name,
        type: "DAMM v2",
        tokenASymbol: pool.token_a_symbol || "TOKEN_A",
        tokenBSymbol: pool.token_b_symbol || "TOKEN_B",
        apy: pool.apr ?? 0,
        fee24h: pool.fee24h ?? 0,
        tvl: pool.tvl ?? 0,
        feeTvlRatio: pool.fee_tvl_ratio ?? 0,
        isVerified: !!pool.tokens_verified,
        poolData: this.mapToPoolData(pool),
      };
    } catch {
      return null;
    }
  }

  private mapToPoolData(d: any): MeteoraPoolData {
    return {
      pool_address: d.pool_address,
      pool_name: d.pool_name,
      creator: d.creator,
      token_a_mint: d.token_a_mint,
      token_b_mint: d.token_b_mint,
      token_a_vault: d.token_a_vault,
      token_b_vault: d.token_b_vault,
      token_a_symbol: d.token_a_symbol,
      token_b_symbol: d.token_b_symbol,
      alpha_vault: d.alpha_vault,
      sqrt_min_price: d.sqrt_min_price,
      sqrt_max_price: d.sqrt_max_price,
      min_price: d.min_price,
      max_price: d.max_price,
      liquidity: d.liquidity,
      permanent_lock_liquidity: d.permanent_lock_liquidity,
      sqrt_price: d.sqrt_price,
      token_a_amount: d.token_a_amount,
      token_b_amount: d.token_b_amount,
      token_a_amount_usd: d.token_a_amount_usd,
      token_b_amount_usd: d.token_b_amount_usd,
      pool_price: d.pool_price,
      virtual_price: d.virtual_price,
      pool_type: d.pool_type,
      created_at_slot: d.created_at_slot,
      created_at_slot_timestamp: d.created_at_slot_timestamp,
      updated_at: d.updated_at,
      tvl: d.tvl,
      apr: d.apr,
      fee_tvl_ratio: d.fee_tvl_ratio,
      fee24h: d.fee24h,
      volume24h: d.volume24h,
      base_fee: d.base_fee,
      dynamic_fee: d.dynamic_fee,
      fee_scheduler_mode: d.fee_scheduler_mode,
      collect_fee_mode: d.collect_fee_mode,
      launchpad: d.launchpad,
      tokens_verified: d.tokens_verified,
      has_farm: d.has_farm,
      farm_active: d.farm_active,
    };
  }
}
