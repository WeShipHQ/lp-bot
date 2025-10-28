import { api, HTTPError, type RetryConfig } from "@/utils/http-client.util";
import { getDexConfig } from "@/config/dex.config";
import {
  DlmmPoolsPaginationParams,
  MeteoraDlmmPoolResponse,
  MeteoraDlmmPoolsPaginationResponse,
  MeteoraDammV1PoolResponse,
  MeteoraDammV2PoolResponse,
} from "@/types/meteora.types";
import {
  DlmmClaimFee,
  DlmmClaimReward,
  DlmmDepositWithdraw,
} from "@/types/portfolio.types";
import { CircuitBreaker } from "@/infrastructure/resilience/circuit-breaker";
import { getCacheService } from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";
import { createChildLogger } from "@/utils/logger";

/**
 * Configuration options for MeteoraApiClient
 */
export interface MeteoraApiClientConfig {
  /** Base URL for DLMM API */
  dlmmApiUrl?: string;
  /** Base URL for DAMM v1 API */
  dammV1ApiUrl?: string;
  /** Base URL for DAMM v2 API */
  dammV2ApiUrl?: string;
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Enable exponential backoff for retries */
  exponentialBackoff?: boolean;
  /** TTL for cached responses in seconds */
  cacheTtl?: {
    dlmmPool?: number;
    dammV1Pool?: number;
    dammV2Pool?: number;
    trendingPools?: number;
    positionData?: number;
  };
  /** Circuit breaker configuration */
  circuitBreaker?: {
    enabled?: boolean;
    failureThreshold?: number;
    successThreshold?: number;
    timeoutMs?: number;
  };
}

/**
 * Domain-specific error for Meteora API failures
 */
export class MeteoraApiError extends Error {
  constructor(
    message: string,
    public readonly endpoint: string,
    public readonly originalError?: Error,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "MeteoraApiError";
  }
}

/**
 * Enhanced Meteora API Client with retry logic, caching, circuit breaker, and structured logging
 * 
 * Provides methods for:
 * - DLMM pool queries (single, trending, paginated)
 * - DAMM v1/v2 pool queries
 * - Position fee/reward endpoints
 * - Position deposit/withdrawal history
 * 
 * Features:
 * - Configurable retry with exponential backoff
 * - In-memory response caching with per-endpoint TTL
 * - Circuit breaker pattern for resilience
 * - Structured logging for observability
 * - Rich error handling with context preservation
 */
export class MeteoraApiClient {
  private readonly dlmmApiUrl: string;
  private readonly dammV1ApiUrl: string;
  private readonly dammV2ApiUrl: string;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly exponentialBackoff: boolean;
  private readonly cacheTtl: Required<NonNullable<MeteoraApiClientConfig["cacheTtl"]>>;
  private readonly breaker: CircuitBreaker;
  private readonly cache = getCacheService();
  private readonly logger = createChildLogger({ component: "MeteoraApiClient" });
  
  // In-memory cache with TTL
  private readonly memoryCache = new Map<
    string,
    { value: any; expiresAt: number }
  >();

  constructor(config: MeteoraApiClientConfig = {}) {
    // Load from DEX config as defaults
    const dexConfig = getDexConfig("meteora");

    this.dlmmApiUrl = config.dlmmApiUrl || dexConfig.apiUrl || "https://dlmm-api.meteora.ag";
    this.dammV1ApiUrl = config.dammV1ApiUrl || "https://damm-api.meteora.ag";
    this.dammV2ApiUrl = config.dammV2ApiUrl || "https://dammv2-api.meteora.ag";
    this.maxRetries = config.maxRetries ?? dexConfig.retries ?? 3;
    this.timeoutMs = config.timeoutMs ?? dexConfig.timeout ?? 10000;
    this.exponentialBackoff = config.exponentialBackoff ?? true;

    // Cache TTL configuration (seconds)
    this.cacheTtl = {
      dlmmPool: config.cacheTtl?.dlmmPool ?? 60,
      dammV1Pool: config.cacheTtl?.dammV1Pool ?? 60,
      dammV2Pool: config.cacheTtl?.dammV2Pool ?? 60,
      trendingPools: config.cacheTtl?.trendingPools ?? 120,
      positionData: config.cacheTtl?.positionData ?? 30,
    };

    // Circuit breaker configuration
    const cbConfig = config.circuitBreaker ?? {};
    this.breaker = new CircuitBreaker({
      name: "meteora-api",
      failureThreshold: cbConfig.failureThreshold ?? 5,
      successThreshold: cbConfig.successThreshold ?? 2,
      timeoutMs: cbConfig.timeoutMs ?? 15000,
    });

    this.logger.info(
      {
        dlmmApiUrl: this.dlmmApiUrl,
        maxRetries: this.maxRetries,
        timeoutMs: this.timeoutMs,
      },
      "MeteoraApiClient initialized"
    );
  }

  /**
   * Get a value from in-memory cache
   */
  private getFromMemoryCache<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set a value in in-memory cache with TTL
   */
  private setInMemoryCache(key: string, value: any, ttlSeconds: number): void {
    this.memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Generate cache key including query params
   */
  private generateCacheKey(endpoint: string, params?: Record<string, any>): string {
    if (!params) return endpoint;
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${JSON.stringify(params[key])}`)
      .join("&");
    return `${endpoint}?${sortedParams}`;
  }

  private async fetchWithRetryAndTimeout<T>(
    endpoint: string,
    url: string,
    retryConfig: RetryConfig
  ): Promise<T> {
    const mergedRetryConfig: RetryConfig = {
      ...retryConfig,
      maxRetries: retryConfig.maxRetries ?? this.maxRetries,
      exponentialBackoff:
        retryConfig.exponentialBackoff ?? this.exponentialBackoff,
    };

    const performRequest = async () => {
      try {
        return await api.getWithRetry<T>(
          url,
          undefined,
          mergedRetryConfig
        );
      } catch (error) {
        if (error instanceof HTTPError) {
          throw new MeteoraApiError(
            `HTTP ${error.status}: ${error.statusText}`,
            endpoint,
            error,
            error.status
          );
        }
        throw error;
      }
    };

    if (this.timeoutMs <= 0) {
      return performRequest();
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const requestPromise = performRequest();
    requestPromise.catch(() => undefined);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new MeteoraApiError(
            `Request to ${endpoint} timed out after ${this.timeoutMs}ms`,
            endpoint,
            undefined,
            408
          )
        );
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([requestPromise, timeoutPromise]);
      return result as T;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Execute HTTP request with retry, circuit breaker, caching, and logging
   */
  private async executeRequest<T>(
    endpoint: string,
    url: string,
    retryConfig: RetryConfig,
    cacheTtl: number,
    cacheKey?: string
  ): Promise<T> {
    const key = cacheKey || url;
    const startTime = Date.now();
    const requestLogger = this.logger.child({ endpoint, url });

    // Check in-memory cache first
    const cachedInMemory = this.getFromMemoryCache<T>(key);
    if (cachedInMemory) {
      requestLogger.debug({ cacheKey: key }, "Cache hit (memory)");
      return cachedInMemory;
    }

    // Check Redis cache
    const cachedInRedis = await this.cache.get<T>(key);
    if (cachedInRedis) {
      requestLogger.debug({ cacheKey: key }, "Cache hit (redis)");
      // Populate in-memory cache
      this.setInMemoryCache(key, cachedInRedis, cacheTtl);
      return cachedInRedis;
    }

    // Execute with circuit breaker
    try {
      const data = await this.breaker.execute(
        async () => {
          requestLogger.debug({ attempt: 1 }, "Making HTTP request");
          
          const response = await this.fetchWithRetryAndTimeout<T>(
            endpoint,
            url,
            retryConfig
          );

          const duration = Date.now() - startTime;
          requestLogger.info({
            duration,
            cached: false,
          }, "Request successful");

          return response;
        },
        // Fallback: return cached data when circuit is open
        async () => {
          requestLogger.warn("Circuit breaker open, attempting fallback");
          const fallbackCache = await this.cache.get<T>(key);
          if (fallbackCache) {
            const duration = Date.now() - startTime;
            requestLogger.info({
              cacheKey: key,
              duration,
            }, "Fallback to stale cache");
            this.setInMemoryCache(key, fallbackCache, cacheTtl);
            return fallbackCache;
          }
          throw new MeteoraApiError(
            "Meteora API unavailable and no cached data",
            endpoint
          );
        }
      );

      // Cache successful response
      await this.cache.set(key, data, cacheTtl);
      this.setInMemoryCache(key, data, cacheTtl);

      return data;
    } catch (error) {
      const duration = Date.now() - startTime;
      requestLogger.error({
        error: error instanceof Error ? error.message : String(error),
        duration,
      }, "Request failed");

      if (error instanceof MeteoraApiError) {
        throw error;
      }

      throw new MeteoraApiError(
        `Failed to fetch from ${endpoint}`,
        endpoint,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Fetch a single DLMM pool by address
   * @param poolAddress - Pool address
   * @returns Pool data
   */
  async getPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse> {
    const endpoint = `/pair/${poolAddress}`;
    const url = `${this.dlmmApiUrl}${endpoint}`;
    const cacheKey = CacheKeys.poolKey("meteora", poolAddress);

    return this.executeRequest<MeteoraDlmmPoolResponse>(
      endpoint,
      url,
      {},
      this.cacheTtl.dlmmPool,
      cacheKey
    );
  }

  /**
   * Fetch trending DLMM pools with pagination
   * @param params - Pagination and filter parameters
   * @returns Paginated pool response
   */
  async getTrendingPools(
    params: DlmmPoolsPaginationParams = {}
  ): Promise<MeteoraDlmmPoolsPaginationResponse> {
    const url = new URL(`${this.dlmmApiUrl}/pair/all_with_pagination`);

    // Build query parameters
    if (params.page !== undefined) url.searchParams.set("page", String(params.page));
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    if (params.skip_size !== undefined) url.searchParams.set("skip_size", String(params.skip_size));
    if (params.pools_to_top) params.pools_to_top.forEach((p) => url.searchParams.append("pools_to_top", p));
    if (params.sort_key) url.searchParams.set("sort_key", params.sort_key);
    if (params.order_by) url.searchParams.set("order_by", params.order_by);
    if (params.search_term) url.searchParams.set("search_term", params.search_term);
    if (params.include_unknown !== undefined) url.searchParams.set("include_unknown", String(params.include_unknown));
    if (params.hide_low_tvl !== undefined) url.searchParams.set("hide_low_tvl", String(params.hide_low_tvl));
    if (params.hide_low_apr !== undefined) url.searchParams.set("hide_low_apr", String(params.hide_low_apr));
    if (params.include_token_mints) params.include_token_mints.forEach((m) => url.searchParams.append("include_token_mints", m));
    if (params.include_pool_token_pairs) params.include_pool_token_pairs.forEach((pair) => url.searchParams.append("include_pool_token_pairs", pair));
    if (params.tags) params.tags.forEach((t) => url.searchParams.append("tags", t));
    if (params.launchpad) params.launchpad.forEach((lp) => url.searchParams.append("launchpad", lp));

    const cacheKey = `${CacheKeys.trendingPoolsKey(
      "meteora",
      params.sort_key || "default",
      params.page || 1
    )}:${this.generateCacheKey("/pair/all_with_pagination", params)}`;

    return this.executeRequest<MeteoraDlmmPoolsPaginationResponse>(
      "/pair/all_with_pagination",
      url.toString(),
      {},
      this.cacheTtl.trendingPools,
      cacheKey
    );
  }

  /**
   * Fetch all DLMM pools (without pagination)
   * @returns Array of all pools
   */
  async getAllPools(): Promise<MeteoraDlmmPoolResponse[]> {
    const endpoint = "/pair/all";
    const url = `${this.dlmmApiUrl}${endpoint}`;

    const result = await this.executeRequest<
      { pairs?: MeteoraDlmmPoolResponse[] } | MeteoraDlmmPoolResponse[]
    >(endpoint, url, {}, this.cacheTtl.trendingPools);

    // Handle different response formats
    if (Array.isArray(result)) return result;
    if (result && Array.isArray((result as any).pairs)) {
      return (result as any).pairs as MeteoraDlmmPoolResponse[];
    }
    return [];
  }

  /**
   * Fetch a DAMM v1 pool by address
   * @param poolId - Pool address
   * @returns DAMM v1 pool data
   */
  async getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse> {
    const endpoint = `/pools`;
    const url = `${this.dammV1ApiUrl}${endpoint}?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`;
    const cacheKey = CacheKeys.poolKey("meteora-damm-v1", poolId);

    const result = await this.executeRequest<MeteoraDammV1PoolResponse[]>(
      endpoint,
      url,
      {},
      this.cacheTtl.dammV1Pool,
      cacheKey
    );

    // DAMM v1 API returns an array; extract first element
    if (!result || result.length === 0) {
      throw new MeteoraApiError(
        `DAMM v1 pool not found: ${poolId}`,
        endpoint,
        undefined,
        404
      );
    }

    return result[0];
  }

  /**
   * Fetch a DAMM v2 pool by address
   * @param poolId - Pool address
   * @returns DAMM v2 pool data
   */
  async getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse> {
    const endpoint = `/pools/${poolId}`;
    const url = `${this.dammV2ApiUrl}${endpoint}`;
    const cacheKey = CacheKeys.poolKey("meteora-damm-v2", poolId);

    return this.executeRequest<MeteoraDammV2PoolResponse>(
      endpoint,
      url,
      {},
      this.cacheTtl.dammV2Pool,
      cacheKey
    );
  }

  /**
   * Fetch claimable fees for a position
   * @param positionAddress - Position address
   * @returns Array of claimable fees
   */
  async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]> {
    const endpoint = `/position/${positionAddress}/claim_fees`;
    const url = `${this.dlmmApiUrl}${endpoint}`;
    const cacheKey = `position:${positionAddress}:claim_fees`;

    try {
      const data = await this.executeRequest<DlmmClaimFee[]>(
        endpoint,
        url,
        {},
        this.cacheTtl.positionData,
        cacheKey
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      // Return empty array for 404 (position not found)
      if (error instanceof MeteoraApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch claimable rewards for a position
   * @param positionAddress - Position address
   * @returns Array of claimable rewards
   */
  async getPositionClaimRewards(positionAddress: string): Promise<DlmmClaimReward[]> {
    const endpoint = `/position/${positionAddress}/claim_rewards`;
    const url = `${this.dlmmApiUrl}${endpoint}`;
    const cacheKey = `position:${positionAddress}:claim_rewards`;

    try {
      const data = await this.executeRequest<DlmmClaimReward[]>(
        endpoint,
        url,
        {},
        this.cacheTtl.positionData,
        cacheKey
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error instanceof MeteoraApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch deposit history for a position
   * @param positionAddress - Position address
   * @returns Array of deposits
   */
  async getPositionDeposits(positionAddress: string): Promise<DlmmDepositWithdraw[]> {
    const endpoint = `/position/${positionAddress}/deposits`;
    const url = `${this.dlmmApiUrl}${endpoint}`;
    const cacheKey = `position:${positionAddress}:deposits`;

    try {
      const data = await this.executeRequest<DlmmDepositWithdraw[]>(
        endpoint,
        url,
        {},
        this.cacheTtl.positionData,
        cacheKey
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error instanceof MeteoraApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fetch withdrawal history for a position
   * @param positionAddress - Position address
   * @returns Array of withdrawals
   */
  async getPositionWithdraws(positionAddress: string): Promise<DlmmDepositWithdraw[]> {
    const endpoint = `/position/${positionAddress}/withdraws`;
    const url = `${this.dlmmApiUrl}${endpoint}`;
    const cacheKey = `position:${positionAddress}:withdraws`;

    try {
      const data = await this.executeRequest<DlmmDepositWithdraw[]>(
        endpoint,
        url,
        {},
        this.cacheTtl.positionData,
        cacheKey
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      if (error instanceof MeteoraApiError && error.statusCode === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Clear all cached data for this client
   */
  async clearCache(): Promise<void> {
    this.memoryCache.clear();
    await this.cache.invalidate("pool:meteora*");
    await this.cache.invalidate("pool:meteora-damm-v1*");
    await this.cache.invalidate("pool:meteora-damm-v2*");
    await this.cache.invalidate("trending:meteora*");
    await this.cache.invalidate("position:*");
    this.logger.info("Cache cleared");
  }

  /**
   * Get circuit breaker state for monitoring
   */
  getCircuitBreakerState() {
    return this.breaker.getState();
  }
}

/**
 * Singleton instance for convenience
 */
export const meteoraApiClient = new MeteoraApiClient();
