import { api } from "@/utils/http-client.util";
import { getDexConfig } from "@/config/dex.config";
import {
  DlmmPoolsPaginationParams,
  MeteoraDlmmPoolResponse,
  MeteoraDlmmPoolsPaginationResponse,
} from "@/types/meteora.types";

export class MeteoraApiClient {
  private readonly baseUrl: string;
  private readonly retries: number;

  constructor() {
    const cfg = getDexConfig("meteora");
    this.baseUrl = cfg.apiUrl || "https://dlmm-api.meteora.ag";
    this.retries = cfg.retries ?? 3;
  }

  async getPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse> {
    const url = `${this.baseUrl}/pair/${poolAddress}`;
    try {
      return await api.getWithRetry<MeteoraDlmmPoolResponse>(url, undefined, {
        maxRetries: this.retries,
        exponentialBackoff: true,
      });
    } catch (error) {
      console.error(
        `[MeteoraApiClient] Failed to fetch pool ${poolAddress}`,
        error
      );
      throw error;
    }
  }

  async getTrendingPools(
    params: DlmmPoolsPaginationParams = {}
  ): Promise<MeteoraDlmmPoolsPaginationResponse> {
    const url = new URL(`${this.baseUrl}/pair/all_with_pagination`);

    if (params.page !== undefined)
      url.searchParams.set("page", String(params.page));
    if (params.limit !== undefined)
      url.searchParams.set("limit", String(params.limit));
    if (params.skip_size !== undefined)
      url.searchParams.set("skip_size", String(params.skip_size));
    if (params.pools_to_top)
      params.pools_to_top.forEach((p) =>
        url.searchParams.append("pools_to_top", p)
      );
    if (params.sort_key) url.searchParams.set("sort_key", params.sort_key);
    if (params.order_by) url.searchParams.set("order_by", params.order_by);
    if (params.search_term)
      url.searchParams.set("search_term", params.search_term);
    if (params.include_unknown !== undefined)
      url.searchParams.set("include_unknown", String(params.include_unknown));
    if (params.hide_low_tvl !== undefined)
      url.searchParams.set("hide_low_tvl", String(params.hide_low_tvl));
    if (params.hide_low_apr !== undefined)
      url.searchParams.set("hide_low_apr", String(params.hide_low_apr));
    if (params.include_token_mints)
      params.include_token_mints.forEach((m) =>
        url.searchParams.append("include_token_mints", m)
      );
    if (params.include_pool_token_pairs)
      params.include_pool_token_pairs.forEach((pair) =>
        url.searchParams.append("include_pool_token_pairs", pair)
      );
    if (params.tags)
      params.tags.forEach((t) => url.searchParams.append("tags", t));
    if (params.launchpad)
      params.launchpad.forEach((lp) =>
        url.searchParams.append("launchpad", lp)
      );

    try {
      return await api.getWithRetry<MeteoraDlmmPoolsPaginationResponse>(
        url.toString(),
        undefined,
        {
          maxRetries: this.retries,
          exponentialBackoff: true,
        }
      );
    } catch (error) {
      console.error(`[MeteoraApiClient] Failed to fetch trending pools`, error);
      throw error;
    }
  }

  async getAllPools(): Promise<MeteoraDlmmPoolResponse[]> {
    const url = `${this.baseUrl}/pair/all`;
    try {
      const res = await api.getWithRetry<
        { pairs?: MeteoraDlmmPoolResponse[] } | MeteoraDlmmPoolResponse[]
      >(url, undefined, {
        maxRetries: this.retries,
        exponentialBackoff: true,
      });

      if (Array.isArray(res)) return res;
      if (res && Array.isArray((res as any).pairs))
        return (res as any).pairs as MeteoraDlmmPoolResponse[];
      return [];
    } catch (error) {
      console.error(`[MeteoraApiClient] Failed to fetch all pools`, error);
      throw error;
    }
  }
}

export const meteoraApiClient = new MeteoraApiClient();
