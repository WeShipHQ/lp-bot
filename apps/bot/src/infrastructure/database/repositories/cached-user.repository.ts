import { User } from "@/domain/user/user.entity";
import { IUserRepository } from "@/domain/user/user.repository";
import type { UserPreferences } from "@/domain/user/types";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";
import type { ICacheService } from "@/infrastructure/cache/cache.service";

const DEFAULT_USER_CACHE_TTL_SECONDS = 60 * 5; // 5 minutes

type CachedUserRecord = {
  id: string;
  telegramId: string;
  privyUserId: string;
  walletId: string;
  walletAddress: string;
  username: string | null;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
};

type CacheKeyIdentifiers = {
  id?: string | null;
  telegramId?: string | null;
  walletId?: string | null;
  walletAddress?: string | null;
};

export class CachedUserRepository implements IUserRepository {
  constructor(
    private readonly baseRepository: IUserRepository,
    private readonly cacheService: ICacheService,
    private readonly ttlSeconds: number = DEFAULT_USER_CACHE_TTL_SECONDS
  ) {}

  async findById(id: string): Promise<User | null> {
    const cached = await this.getFromCache(CacheKeys.userById(id));
    if (cached) {
      return cached;
    }

    const user = await this.baseRepository.findById(id);
    if (user) {
      await this.cacheUser(user);
    }

    return user;
  }

  async findByTelegramId(telegramId: string): Promise<User | null> {
    const cached = await this.getFromCache(CacheKeys.userByTelegramId(telegramId));
    if (cached) {
      return cached;
    }

    const user = await this.baseRepository.findByTelegramId(telegramId);
    if (user) {
      await this.cacheUser(user);
    }

    return user;
  }

  async findByWalletAddress(address: string): Promise<User | null> {
    const cached = await this.getFromCache(CacheKeys.userByWalletAddress(address));
    if (cached) {
      return cached;
    }

    const user = await this.baseRepository.findByWalletAddress(address);
    if (user) {
      await this.cacheUser(user);
    }

    return user;
  }

  async findByWalletId(walletId: string): Promise<User | null> {
    const cached = await this.getFromCache(CacheKeys.userByWalletId(walletId));
    if (cached) {
      return cached;
    }

    const user = await this.baseRepository.findByWalletId(walletId);
    if (user) {
      await this.cacheUser(user);
    }

    return user;
  }

  async save(user: User): Promise<void> {
    await this.baseRepository.save(user);
    await this.invalidateUser({
      id: user.id,
      telegramId: user.telegramId,
      walletId: user.walletId,
      walletAddress: user.walletAddress,
    });
  }

  async update(user: User): Promise<void> {
    await this.baseRepository.update(user);
    await this.invalidateUser({
      id: user.id,
      telegramId: user.telegramId,
      walletId: user.walletId,
      walletAddress: user.walletAddress,
    });
  }

  async delete(id: string): Promise<void> {
    const cachedRecord = await this.cacheService.get<CachedUserRecord>(
      CacheKeys.userById(id)
    );

    await this.baseRepository.delete(id);

    if (cachedRecord) {
      await this.invalidateUser(cachedRecord);
    } else {
      await this.invalidateUser({ id });
    }
  }

  async exists(telegramId: string): Promise<boolean> {
    const cached = await this.cacheService.get<CachedUserRecord>(
      CacheKeys.userByTelegramId(telegramId)
    );

    if (cached) {
      return true;
    }

    return this.baseRepository.exists(telegramId);
  }

  private async getFromCache(key: string): Promise<User | null> {
    const cached = await this.cacheService.get<CachedUserRecord>(key);
    if (!cached) {
      return null;
    }

    return this.deserialize(cached);
  }

  private serialize(user: User): CachedUserRecord {
    return {
      id: user.id,
      telegramId: user.telegramId,
      privyUserId: user.privyUserId,
      walletId: user.walletId,
      walletAddress: user.walletAddress,
      username: user.getUsername(),
      preferences: user.getPreferences(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.getUpdatedAt().toISOString(),
    };
  }

  private deserialize(record: CachedUserRecord): User {
    return User.reconstitute({
      id: record.id,
      telegramId: record.telegramId,
      privyUserId: record.privyUserId,
      walletId: record.walletId,
      walletAddress: record.walletAddress,
      username: record.username ?? undefined,
      preferences: record.preferences,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    });
  }

  private async cacheUser(user: User): Promise<void> {
    const record = this.serialize(user);

    const keys = [
      CacheKeys.userById(user.id),
      CacheKeys.userByTelegramId(user.telegramId),
      CacheKeys.userByWalletId(user.walletId),
      CacheKeys.userByWalletAddress(user.walletAddress),
    ];

    await Promise.all(
      keys.map((key) => this.cacheService.set(key, record, this.ttlSeconds))
    );
  }

  private async invalidateUser(identifiers: CacheKeyIdentifiers): Promise<void> {
    const keys = this.getCacheKeys(identifiers);
    if (keys.length === 0) {
      return;
    }

    await Promise.all(keys.map((key) => this.cacheService.invalidate(key)));
  }

  private getCacheKeys(identifiers: CacheKeyIdentifiers): string[] {
    const keys = new Set<string>();

    if (identifiers.id) {
      keys.add(CacheKeys.userById(identifiers.id));
    }

    if (identifiers.telegramId) {
      keys.add(CacheKeys.userByTelegramId(identifiers.telegramId));
    }

    if (identifiers.walletId) {
      keys.add(CacheKeys.userByWalletId(identifiers.walletId));
    }

    if (identifiers.walletAddress) {
      keys.add(CacheKeys.userByWalletAddress(identifiers.walletAddress));
    }

    return Array.from(keys);
  }
}
