import { dexRegistry } from "@/services/dex-registry.service";
import { UnifiedPool } from "@/types/core.types";

export class SearchPoolsUseCase {
  async execute(tokenAddress: string): Promise<UnifiedPool[]> {
    const adapters = dexRegistry.getEnabled();
    const results = await Promise.allSettled(
      adapters.map((a) => a.searchPools(tokenAddress))
    );

    const pools: UnifiedPool[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        pools.push(...r.value);
      }
    }
    return pools;
  }
}
