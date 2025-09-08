import { HotPoolFilters, HotPoolItem, PoolSortCriteria } from "./types";

export function applyFilters(
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

export function sortPools(
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

export function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}
