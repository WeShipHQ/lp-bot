import { IPositionRepository } from '@/domain/position/position.repository';
import { DexType } from '@/types/core.types';
import { IDexAdapter } from '@/types/dex-adapter.interface';
import { getCacheService, ICacheService } from '@/infrastructure/cache/cache.service';
import { CacheKeys, CachePatterns } from '@/infrastructure/cache/cache-keys';
import { findUserById } from '@/db/queries';
import { Money, TokenAmount } from '@/domain/shared/value-objects';

export interface DexRegistryLike {
  get(dexType: DexType): IDexAdapter;
}

export class SyncPortfolioUseCase {
  private readonly cache: ICacheService;

  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  /**
   * Fetch latest data from blockchain for user's positions and update DB
   */
  async execute(userId: string): Promise<void> {
    const user = await findUserById(userId);
    const address = user?.walletAddress;
    if (!address) return;

    const positions = await this.positionRepository.findByUser(userId);
    const byDex = new Map<DexType, typeof positions>();
    for (const p of positions) {
      const arr = byDex.get(p.dex) ?? [];
      arr.push(p);
      byDex.set(p.dex, arr as any);
    }

    for (const [dex, group] of byDex) {
      try {
        const adapter = this.dexRegistry.get(dex);
        const unified = await adapter.getUserPositions(address);
        const byAddr = new Map(unified.map((u) => [u.address, u] as const));

        for (const p of group) {
          const u = byAddr.get(p.positionAddress);
          if (!u) continue;
          const x = TokenAmount.fromUi(p.tokenX.symbol, parseFloat(u.tokenAAmount), p.tokenX.decimals);
          const y = TokenAmount.fromUi(p.tokenY.symbol, parseFloat(u.tokenBAmount), p.tokenY.decimals);
          p.updateTokenAmounts(x, y);
          p.updateCurrentValue(Money.usd(u.currentValueUsd));
          await this.positionRepository.update(p);
          // invalidate per-position cache
          await this.cache.invalidate(CachePatterns.positionPattern(p.id));
        }
      } catch (e) {
        console.warn('[SyncPortfolioUseCase] update failed for', dex, e);
      }
    }

    // Invalidate portfolio cache
    await this.cache.invalidate(CachePatterns.portfolioPattern(userId));
  }
}
