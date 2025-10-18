import { getCacheService, ICacheService } from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";
import { dexRegistry } from "@/services/dex-registry.service";
import { DexType, PaginatedTrendingPools, TrendingParams, UnifiedPool } from "@/types/core.types";

export interface GetTrendingPoolsParams extends TrendingParams {
  dex?: DexType | "all";
}

export class GetTrendingPoolsUseCase {
  private readonly cache: ICacheService;
  constructor(cacheService: ICacheService = getCacheService()) {
    this.cache = cacheService;
  }

  async execute(params: GetTrendingPoolsParams = {}): Promise<PaginatedTrendingPools> {
    const { dex = "all", page = 1, limit = 5, sortBy = "apy" } = params;

    const cacheKey = CacheKeys.trendingPoolsKey(String(dex), sortBy, page);
    const cached = await this.cache.get<PaginatedTrendingPools>(cacheKey);
    if (cached) return cached;

    if (dex === "all") {
      // Merge across adapters
      const adapters = dexRegistry.getEnabled();
      const results = await Promise.all(
        adapters.map((a) => a.getTrendingPools({ page, limit, sortBy }))
      );
      const merged: UnifiedPool[] = results.flatMap((r) => r.pools);

      const sorted = merged.sort((a, b) => {
        switch (sortBy) {
          case "tvl":
            return Number(b.tvl) - Number(a.tvl);
          case "volume24h":
            return (b.volume24h || 0) - (a.volume24h || 0);
          case "fee_tvl_ratio":
            return (b.feeTvlRatio24h || 0) - (a.feeTvlRatio24h || 0);
          case "apy":
          default:
            return (b.apy || 0) - (a.apy || 0);
        }
      });

      const paginated = sorted.slice(0, limit);
      const resp: PaginatedTrendingPools = {
        pools: paginated,
        currentPage: page,
        totalPages: 1, // merged view
        sortBy,
      };
      await this.cache.set(cacheKey, resp, 60); // cache 1 minute
      return resp;
    }

    // Single DEX path
    const adapter = dexRegistry.get(dex);
    const resp = await adapter.getTrendingPools({ page, limit, sortBy });
    await this.cache.set(cacheKey, resp, 60);
    return resp;
  }
}
