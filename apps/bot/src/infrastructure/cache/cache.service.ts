import Redis from "ioredis";
import { CONFIG } from "@/config";

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export class CacheService implements ICacheService {
  private client: Redis | null;

  constructor(redisUrl?: string) {
    try {
      const url = redisUrl || CONFIG.REDIS.URL;
      this.client = new Redis(url, { lazyConnect: true });
      // Attempt to connect, but don't throw on failure; allow best-effort caching
      this.client.connect().catch((err) => {
        console.warn(
          "[CacheService] Redis connect failed, falling back to no-op cache:",
          err?.message || err
        );
        this.client = null;
      });
    } catch (err) {
      console.warn("[CacheService] Redis init error, disabling cache:", err);
      this.client = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.warn("[CacheService] get error for key", key, err);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    // if (!this.client) return;
    // try {
    //   const payload = JSON.stringify(value);
    //   if (ttlSeconds > 0) {
    //     await this.client.setex(key, ttlSeconds, payload);
    //   } else {
    //     await this.client.set(key, payload);
    //   }
    // } catch (err) {
    //   console.warn('[CacheService] set error for key', key, err);
    // }
  }

  async invalidate(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      // ioredis supports scan/scanStream; for simplicity, use KEYS when acceptable
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (err) {
      console.warn("[CacheService] invalidate error for pattern", pattern, err);
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (err) {
      console.warn("[CacheService] has error for key", key, err);
      return false;
    }
  }
}

let cacheInstance: CacheService | null = null;
export function getCacheService(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}
