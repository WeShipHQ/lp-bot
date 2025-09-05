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
      case "tvl":
        return b.tvl - a.tvl;
      case "volume":
        // FIXME
        return b.fee24h - a.fee24h;
      case "feetvlratio":
        return (b.feeTvlRatio || 0) - (a.feeTvlRatio || 0);
      default:
        return b.apy - a.apy;
    }
  });
}
