import { PairItem } from "../types/trending.types";
import { CONFIG } from "../config";
import { TRENDING_CONSTANTS } from "@/constants/trending.constants";

export class MeteoraeTrendingService {
  private readonly baseUrl = CONFIG.METEORA.API_URL;

  private buildUrl(endpoint: string, params: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
    return url.toString();
  }

  async fetchPairsPage(
    page = 0,
    limit = TRENDING_CONSTANTS.DEFAULT_LIMIT,
    sortKey: "volume12h"
  ): Promise<PairItem[]> {
    const url = this.buildUrl("/pair/all_with_pagination", {
      page: String(page),
      limit: String(limit),
      sort_key: sortKey,
      order_by: "desc",
      include_unknown: "false",
      hide_low_tvl: String(5000),
    });

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[Meteora] ${res.status} ${res.statusText} :: ${text}`);
    }
    const json = await res.json();
    return (json.pairs || []) as PairItem[];
  }
}

export const meteoraTrendingService = new MeteoraeTrendingService();
