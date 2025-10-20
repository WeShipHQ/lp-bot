import { unifiedPoolService } from "@/v2";
import { SELECTED_DEX } from "@/bot/config/constants";
import { getEnabledDexTypes, isDexEnabled } from "@/config/dex.config";
import type {
  DexType,
  PaginatedTrendingPools,
  TrendingParams,
  TrendingPoolsSortCriteria,
} from "@/types/core.types";

/**
 * TrendingV2Service
 * Central entry point for fetching trending pools following the system design.
 * - Chooses the correct DEX (env-driven with fallback to first enabled)
 * - Delegates to adapters via unifiedPoolService (caching, normalization)
 * - Provides a single interface for presentation layer
 */
export class TrendingV2Service {
  /** Determine which DEX to use based on params/env/enabled registry */
  private pickDex(dex?: DexType | "auto" | "all"): DexType | "all" {
    if (dex === "all") return "all";

    const preferred = (dex && dex !== "auto" ? dex : SELECTED_DEX) as DexType;
    if (preferred && isDexEnabled(preferred)) return preferred;

    const enabled = getEnabledDexTypes();
    if (enabled.length > 0) return enabled[0];

    // Fallback to meteora as safe default
    return "meteora";
  }

  async getTrendingPools(
    params: TrendingParams & { dex?: DexType | "auto" | "all" } = {}
  ): Promise<PaginatedTrendingPools> {
    const {
      dex: maybeDex = "auto",
      page = 1,
      limit = 5,
      sortBy = "apy" as TrendingPoolsSortCriteria,
      sortOrder = "desc",
      minTvl = 0,
      verified = true,
    } = params as any;

    const chosen = this.pickDex(maybeDex);

    if (chosen === "all") {
      // Use application use-case for merged view when available
      try {
        const { container } = await import("@/infrastructure/di/container");
        const { GetTrendingPoolsUseCase } = await import(
          "@/application/trending/get-trending-pools.use-case"
        );
        const useCase = container.get(GetTrendingPoolsUseCase);
        return await useCase.execute({ dex: "all", page, limit, sortBy });
      } catch (err) {
        // graceful fallback to first enabled dex if merged path unavailable
        const enabled = getEnabledDexTypes();
        const fallback = enabled[0] || (SELECTED_DEX as DexType);
        return unifiedPoolService.getTrendingPools(fallback, {
          page,
          limit,
          sortBy,
          sortOrder,
          minTvl,
          verified,
        });
      }
    }

    // Single-DEX path with fallback to other enabled dexes on failure
    try {
      return await unifiedPoolService.getTrendingPools(chosen as DexType, {
        page,
        limit,
        sortBy,
        sortOrder,
        minTvl,
        verified,
      });
    } catch (error) {
      const enabled = getEnabledDexTypes().filter((d) => d !== chosen);
      for (const alt of enabled) {
        try {
          return await unifiedPoolService.getTrendingPools(alt, {
            page,
            limit,
            sortBy,
            sortOrder,
            minTvl,
            verified,
          });
        } catch {}
      }
      throw error;
    }
  }
}

export const trendingV2Service = new TrendingV2Service();
