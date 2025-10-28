import { dexRegistry } from "@/services/dex-registry.service";
import { DexType, UnifiedPool } from "@/types/core.types";
import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";

export interface GetPoolDetailsParams {
  poolAddress: string;
  dex: DexType;
}

export class GetPoolDetailsUseCase {
  private readonly cache: ICacheService;

  constructor(cacheService: ICacheService = getCacheService()) {
    this.cache = cacheService;
  }

  async execute(params: GetPoolDetailsParams): Promise<UnifiedPool> {
    const { poolAddress, dex } = params;

    if (!poolAddress || !dex) {
      throw new Error("poolAddress and dex are required");
    }

    const cacheKey = CacheKeys.poolKey(dex, poolAddress);
    // const cached = await this.cache.get<UnifiedPool>(cacheKey);
    // if (cached) return cached;

    const adapter = dexRegistry.get(dex);
    const pool = await adapter.getPool(poolAddress);

    await this.cache.set(cacheKey, pool, 5 * 60);
    return pool;
  }
}
