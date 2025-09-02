import { JupiterPricesResponse } from "@/types/jupiter.types";
import {
  CachedPrice,
  PriceRequest,
  PricingTokenConfig,
  PricingTokenPriority,
  TokenPrice,
} from "@/types/token.types";
import { PricingRateLimiter } from "@/utils/price-rate-limiter";
import Redis from "ioredis";

export class TokenPriceService {
  private redisClient?: Redis;
  private priceCache = new Map<string, CachedPrice>();
  private requestQueue: PriceRequest[] = [];
  private isProcessing = false;
  private rateLimiter = new PricingRateLimiter();
  private volatileTokens = new Set<string>();
  private updateIntervals = new Map<string, NodeJS.Timeout>();

  // Cache TTL based on token priority
  private readonly CACHE_TTL = {
    HIGH_PRIORITY: 30, // 30 seconds for volatile tokens
    MEDIUM_PRIORITY: 300, // 5 minutes for stable tokens
    LOW_PRIORITY: 900, // 15 minutes for rarely accessed tokens
  };

  private readonly MAJOR_TOKENS = new Set([
    "So11111111111111111111111111111111111111112", // SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
  ]);

  private readonly jupiterApiUrl = "https://lite-api.jup.ag/price/v3";

  constructor(redisClient?: Redis) {
    this.redisClient = redisClient;
    this.startBatchProcessor();
    this.initializeTokenConfigs();
  }

  async getPrice(tokenAddress: string): Promise<TokenPrice | null> {
    // 1. Check in-memory cache first
    const cached = this.priceCache.get(tokenAddress);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.price;
    }

    // 2. Check Redis cache if available
    if (this.redisClient) {
      const redisCached = await this.redisClient.get(`price:${tokenAddress}`);
      if (redisCached) {
        const parsed = JSON.parse(redisCached);
        this.priceCache.set(tokenAddress, parsed);
        if (!this.isCacheExpired(parsed)) {
          return parsed.price;
        }
      }
    }

    // 3. Add to request queue for batch processing
    return this.queuePriceRequest(tokenAddress);
  }

  async getPrices(
    tokenAddresses: string[]
  ): Promise<Record<string, TokenPrice>> {
    const results: Record<string, TokenPrice> = {};
    const uncachedTokens: string[] = [];

    // Check cache for each token
    for (const address of tokenAddresses) {
      const cached = await this.getCachedPrice(address);
      if (cached) {
        results[address] = cached;
      } else {
        uncachedTokens.push(address);
      }
    }

    // Batch fetch uncached tokens
    if (uncachedTokens.length > 0) {
      const freshPrices = await this.batchFetchPrices(uncachedTokens);
      Object.assign(results, freshPrices);
    }

    return results;
  }

  async refreshPrice(tokenAddress: string): Promise<TokenPrice | null> {
    try {
      const prices = await this.batchFetchPrices([tokenAddress]);
      return prices[tokenAddress] || null;
    } catch (error) {
      console.error(`Error refreshing price for ${tokenAddress}:`, error);
      return null;
    }
  }

  addVolatileToken(tokenAddress: string): void {
    this.volatileTokens.add(tokenAddress);
    this.scheduleTokenUpdate({
      address: tokenAddress,
      symbol: "VOLATILE",
      priority: PricingTokenPriority.HIGH,
      updateInterval: 30,
    });
  }

  removeVolatileToken(tokenAddress: string): void {
    this.volatileTokens.delete(tokenAddress);
    const interval = this.updateIntervals.get(tokenAddress);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(tokenAddress);
    }
  }

  /**
   * Initialize the price service
   * This method should be called after creating the service instance
   */
  async initialize(): Promise<void> {
    try {
      if (this.redisClient) {
        await this.testRedisConnection();
      }

      // Pre-load prices for major tokens
      await this.preloadMajorTokenPrices();

      console.log("TokenPriceService initialized successfully");
    } catch (error) {
      console.error("Error initializing TokenPriceService:", error);
      throw error;
    }
  }

  /**
   * Test Redis connection
   */
  private async testRedisConnection(): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.ping();
      console.log("Redis connection established for TokenPriceService");
    } catch (error) {
      console.warn(
        "Redis connection failed, falling back to memory cache only:",
        error
      );
      // Don't throw error, just log warning and continue with memory cache
      this.redisClient = undefined;
    }
  }

  /**
   * Pre-load prices for major tokens to warm up the cache
   */
  private async preloadMajorTokenPrices(): Promise<void> {
    try {
      const majorTokenAddresses = Array.from(this.MAJOR_TOKENS);
      console.log(
        "Pre-loading prices for major tokens:",
        majorTokenAddresses.length
      );

      // Fetch prices for major tokens to warm up the cache
      await this.batchFetchPrices(majorTokenAddresses);

      console.log("Major token prices pre-loaded successfully");
    } catch (error) {
      console.warn("Failed to pre-load major token prices:", error);
      // Don't throw error, service can still work without pre-loading
    }
  }

  private async getCachedPrice(
    tokenAddress: string
  ): Promise<TokenPrice | null> {
    // Check in-memory cache
    const cached = this.priceCache.get(tokenAddress);
    if (cached && !this.isCacheExpired(cached)) {
      return cached.price;
    }

    // Check Redis cache
    if (this.redisClient) {
      const redisCached = await this.redisClient.get(`price:${tokenAddress}`);
      if (redisCached) {
        const parsed = JSON.parse(redisCached);
        this.priceCache.set(tokenAddress, parsed);
        if (!this.isCacheExpired(parsed)) {
          return parsed.price;
        }
      }
    }

    return null;
  }

  private isCacheExpired(cached: CachedPrice): boolean {
    const ttl = this.CACHE_TTL[cached.priority];
    return Date.now() - cached.timestamp > ttl * 1000;
  }

  private async queuePriceRequest(
    tokenAddress: string
  ): Promise<TokenPrice | null> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        tokenAddress,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Process queue if not already processing
      if (!this.isProcessing) {
        this.processRequestQueue();
      }
    });
  }

  private async processRequestQueue(): Promise<void> {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Group requests by token address to avoid duplicates
      const uniqueRequests = new Map<string, PriceRequest[]>();

      while (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift()!;

        if (!uniqueRequests.has(request.tokenAddress)) {
          uniqueRequests.set(request.tokenAddress, []);
        }
        uniqueRequests.get(request.tokenAddress)!.push(request);
      }

      const tokenAddresses = Array.from(uniqueRequests.keys());
      const prices = await this.batchFetchPrices(tokenAddresses);

      // Resolve all requests
      // @ts-expect-error
      for (const [tokenAddress, requests] of uniqueRequests) {
        const price = prices[tokenAddress] || null;
        // @ts-expect-error
        requests.forEach((request) => request.resolve(price));
      }
    } catch (error) {
      // Reject all pending requests
      this.requestQueue.forEach((request) => request.reject(error as Error));
      this.requestQueue = [];
    } finally {
      this.isProcessing = false;

      // Process any new requests that came in
      if (this.requestQueue.length > 0) {
        setTimeout(() => this.processRequestQueue(), 100);
      }
    }
  }

  private async batchFetchPrices(
    tokenAddresses: string[]
  ): Promise<Record<string, TokenPrice>> {
    const results: Record<string, TokenPrice> = {};
    const chunks = this.chunkArray(tokenAddresses, 50); // Jupiter API limit

    for (const chunk of chunks) {
      try {
        await this.rateLimiter.acquire(); // Ensure rate limit compliance
        const response = await fetch(
          `${this.jupiterApiUrl}?ids=${chunk.join(",")}`
        );

        if (!response.ok) {
          throw new Error(
            `Jupiter API error: ${response.status} ${response.statusText}`
          );
        }

        const data: JupiterPricesResponse = await response.json();

        // Process and cache results
        for (const [tokenId, priceData] of Object.entries(data || {})) {
          const price: TokenPrice = {
            id: tokenId,
            timestamp: Date.now(),
            price: Number(priceData.usdPrice),
            blockId: priceData.blockId,
            decimals: priceData.decimals,
            priceChange24h: priceData.priceChange24h,
          };

          results[tokenId] = price;
          await this.cachePrice(tokenId, price);
        }
      } catch (error) {
        console.error(`Error fetching prices for chunk:`, error);
        // Continue with next chunk instead of failing entirely
      }
    }

    return results;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async cachePrice(
    tokenAddress: string,
    price: TokenPrice
  ): Promise<void> {
    const priority = this.getTokenPriority(tokenAddress);
    const ttl = this.CACHE_TTL[priority];

    const cachedPrice: CachedPrice = {
      price,
      timestamp: Date.now(),
      priority,
    };

    // Store in memory cache
    this.priceCache.set(tokenAddress, cachedPrice);

    // Store in Redis with TTL if available
    if (this.redisClient) {
      try {
        await this.redisClient.setex(
          `price:${tokenAddress}`,
          ttl,
          JSON.stringify(cachedPrice)
        );
      } catch (error) {
        console.error("Error caching price in Redis:", error);
      }
    }
  }

  private getTokenPriority(tokenAddress: string): PricingTokenPriority {
    if (this.isHighPriorityToken(tokenAddress)) {
      return PricingTokenPriority.HIGH;
    }

    if (this.isMajorToken(tokenAddress)) {
      return PricingTokenPriority.MEDIUM;
    }

    return PricingTokenPriority.LOW;
  }

  private isHighPriorityToken(tokenAddress: string): boolean {
    return this.volatileTokens.has(tokenAddress);
  }

  private isMajorToken(tokenAddress: string): boolean {
    return this.MAJOR_TOKENS.has(tokenAddress);
  }

  private startBatchProcessor(): void {
    // Process queue every 100ms
    setInterval(() => {
      if (!this.isProcessing && this.requestQueue.length > 0) {
        this.processRequestQueue();
      }
    }, 100);
  }

  private initializeTokenConfigs(): void {
    const tokenConfigs: PricingTokenConfig[] = [
      {
        address: "So11111111111111111111111111111111111111112", // SOL
        symbol: "SOL",
        priority: PricingTokenPriority.MEDIUM,
        updateInterval: 60,
      },
      {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        symbol: "USDC",
        priority: PricingTokenPriority.MEDIUM,
        updateInterval: 300,
      },
      {
        address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
        symbol: "JUP",
        priority: PricingTokenPriority.MEDIUM,
        updateInterval: 120,
      },
      {
        address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
        symbol: "USDT",
        priority: PricingTokenPriority.MEDIUM,
        updateInterval: 300,
      },
      {
        address: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", // mSOL
        symbol: "mSOL",
        priority: PricingTokenPriority.MEDIUM,
        updateInterval: 180,
      },
    ];

    // Schedule background updates for major tokens
    tokenConfigs.forEach((config) => {
      this.scheduleTokenUpdate(config);
    });
  }

  private scheduleTokenUpdate(config: PricingTokenConfig): void {
    // Clear existing interval if any
    const existingInterval = this.updateIntervals.get(config.address);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(async () => {
      try {
        await this.refreshPrice(config.address);
      } catch (error) {
        console.error(`Error updating price for ${config.symbol}:`, error);
      }
    }, config.updateInterval * 1000);

    this.updateIntervals.set(config.address, interval);
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    // Clear all intervals
    this.updateIntervals.forEach((interval) => clearInterval(interval));
    this.updateIntervals.clear();

    // Close Redis connection if exists
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  // Utility methods for monitoring
  getCacheStats(): { memorySize: number; redisConnected: boolean } {
    return {
      memorySize: this.priceCache.size,
      redisConnected: this.redisClient?.status === "ready",
    };
  }

  getQueueStats(): { queueSize: number; isProcessing: boolean } {
    return {
      queueSize: this.requestQueue.length,
      isProcessing: this.isProcessing,
    };
  }
}

let priceServiceInstance: TokenPriceService | null = null;

export function createTokenPriceService(
  redisClient?: Redis
): TokenPriceService {
  if (!priceServiceInstance) {
    priceServiceInstance = new TokenPriceService(redisClient);
  }
  return priceServiceInstance;
}

export function getTokenPriceService(): TokenPriceService {
  if (!priceServiceInstance) {
    throw new Error(
      "TokenPriceService not initialized. Call createTokenPriceService first."
    );
  }
  return priceServiceInstance;
}
