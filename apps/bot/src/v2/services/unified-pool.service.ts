import { dexRegistry } from "./dex-registry.service";
import {
  DexType,
  UnifiedPool,
  TrendingParams,
  DexAdapterError,
  PaginatedTrendingPools,
} from "../types/core.types";

/**
 * Unified service for pool operations across all DEXes
 */
export class UnifiedPoolService {
  /**
   * Get pool details from any supported DEX
   */
  async getPool(poolId: string, dexType: DexType): Promise<UnifiedPool> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.getPool(poolId);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to get pool ${poolId} from ${dexType}`,
        dexType,
        "POOL_FETCH_ERROR",
        error as Error
      );
    }
  }

  /**
   * Get trending pools from a specific DEX
   */
  async getTrendingPools(
    dexType: DexType,
    params?: TrendingParams
  ): Promise<PaginatedTrendingPools> {
    try {
      const adapter = dexRegistry.get(dexType);
      return await adapter.getTrendingPools(params);
    } catch (error) {
      throw new DexAdapterError(
        `Failed to get trending pools from ${dexType}`,
        dexType,
        "TRENDING_FETCH_ERROR",
        error as Error
      );
    }
  }

  /**
   * Get trending pools from all enabled DEXes
   */
  async getAllTrendingPools(params?: TrendingParams): Promise<{
    pools: UnifiedPool[];
    dexBreakdown: Record<DexType, UnifiedPool[]>;
    errors: Record<DexType, string>;
  }> {
    const enabledAdapters = dexRegistry.getEnabled();
    const allPools: UnifiedPool[] = [];
    const dexBreakdown: Record<string, UnifiedPool[]> = {};
    const errors: Record<string, string> = {};

    const promises = enabledAdapters.map(async (adapter) => {
      try {
        const pools = await adapter.getTrendingPools(params);
        dexBreakdown[adapter.dexType] = pools.pools;
        return pools.pools;
      } catch (error) {
        console.error(
          `Failed to fetch trending pools from ${adapter.dexType}:`,
          error
        );
        errors[adapter.dexType] = (error as Error).message;
        dexBreakdown[adapter.dexType] = [];
        return [];
      }
    });

    const results = await Promise.all(promises);
    results.forEach((pools) => allPools.push(...pools));

    // Sort by TVL by default
    allPools.sort((a, b) => parseFloat(b.tvl) - parseFloat(a.tvl));

    return {
      pools: allPools,
      dexBreakdown: dexBreakdown as Record<DexType, UnifiedPool[]>,
      errors: errors as Record<DexType, string>,
    };
  }

  /**
   * Search pools across all DEXes
   */
  async searchPools(
    query: string,
    dexTypes?: DexType[]
  ): Promise<{
    pools: UnifiedPool[];
    dexBreakdown: Record<DexType, UnifiedPool[]>;
  }> {
    const adaptersToSearch = dexTypes
      ? dexTypes.map((dex) => dexRegistry.get(dex))
      : dexRegistry.getEnabled();

    const allPools: UnifiedPool[] = [];
    const dexBreakdown: Record<string, UnifiedPool[]> = {};

    const promises = adaptersToSearch.map(async (adapter) => {
      try {
        const pools = await adapter.searchPools(query);
        dexBreakdown[adapter.dexType] = pools;
        return pools;
      } catch (error) {
        console.error(`Search failed for ${adapter.dexType}:`, error);
        dexBreakdown[adapter.dexType] = [];
        return [];
      }
    });

    const results = await Promise.all(promises);
    results.forEach((pools) => allPools.push(...pools));

    return {
      pools: allPools,
      dexBreakdown: dexBreakdown as Record<DexType, UnifiedPool[]>,
    };
  }

  /**
   * Parse pool URL and get pool details
   */
  async getPoolFromUrl(url: string): Promise<UnifiedPool | null> {
    const parseResult = dexRegistry.parseUrl(url);
    if (!parseResult) {
      return null;
    }

    try {
      return await parseResult.adapter.getPool(parseResult.result.poolId);
    } catch (error) {
      console.error(`Failed to get pool from URL ${url}:`, error);
      return null;
    }
  }

  /**
   * Get pools for a specific token across all DEXes
   */
  async getPoolsForToken(tokenAddress: string): Promise<{
    pools: UnifiedPool[];
    dexBreakdown: Record<DexType, UnifiedPool[]>;
  }> {
    // This would search for pools containing the specified token
    // Implementation depends on each DEX's search capabilities
    return this.searchPools(tokenAddress);
  }
}

export const unifiedPoolService = new UnifiedPoolService();
