import { IPositionRepository } from "@/domain/position/position.repository";
import { Position } from "@/domain/position/position.entity";
import { Portfolio } from "@/domain/portfolio/portfolio.entity";
import { DexType, UnifiedPosition } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";
import { findUserById } from "@/db/queries";
import { Money, TokenAmount } from "@/domain/shared/value-objects";

export interface DexRegistryLike {
  get(dexType: DexType): IDexAdapter;
}

export class GetPortfolioUseCase {
  private readonly cache: ICacheService;

  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  /**
   * Build the user's portfolio:
   * - check cache unless forceRefresh
   * - load DB positions
   * - enrich from chain (grouped by DEX for batching)
   * - return Portfolio aggregate and cache for 5 minutes
   */
  async execute(userId: string, forceRefresh = false): Promise<Portfolio> {
    const tStart = Date.now();
    const cacheKey = CacheKeys.portfolioKey(userId);

    if (!forceRefresh) {
      const cached = await this.cache.get<{ serialized: any }>(cacheKey);
      if (cached?.serialized) {
        // Rehydrate Portfolio from serialized data if necessary.
        // For now, store full positions as plain object snapshot and rebuild minimal entity
        const positions = (cached.serialized.positions || []).map((p: any) =>
          Position.reconstitute(p)
        ) as Position[];
        return Portfolio.create(userId, positions);
      }
    }

    const dbPositions = await this.positionRepository.findByUser(userId);


    const user = await findUserById(userId);
    if(!user) throw new Error("User not found");

    const userAddress = user.walletAddress;

    if (userAddress) {
      // Group positions by DEX for batch fetching
      const byDex = new Map<DexType, Position[]>();
      for (const pos of dbPositions) {
        const arr = byDex.get(pos.dex) ?? [];
        arr.push(pos);
        byDex.set(pos.dex, arr);
      }

      // For each DEX, fetch user's positions from adapter and map updates in parallel
      await Promise.all(
        Array.from(byDex.entries()).map(async ([dex, positions]) => {
          const t0 = Date.now();
          try {
            const adapter = this.dexRegistry.get(dex);
            const unifiedPositions: UnifiedPosition[] =
              await adapter.getUserPositions(userAddress);

            // Index by address for quick lookup
            const byAddress = new Map<string, UnifiedPosition>();
            for (const up of unifiedPositions) byAddress.set(up.address, up);

            for (const p of positions) {
              const up = byAddress.get(p.positionAddress);
              if (!up) continue;

              // Update current token amounts (raw on-chain data)
              const xAmount = TokenAmount.fromUi(
                p.tokenX.symbol,
                parseFloat(up.tokenAAmount),
                p.tokenX.decimals
              );
              const yAmount = TokenAmount.fromUi(
                p.tokenY.symbol,
                parseFloat(up.tokenBAmount),
                p.tokenY.decimals
              );
              p.updateTokenAmounts(xAmount, yAmount);
              // Note: USD value calculation moved to enrichment layer
              // Position entity only tracks token amounts now
            }
          } catch (e) {
            // Log and continue; portfolio can still be built with DB values
            console.warn(
              `[GetPortfolioUseCase] Enrichment failed for ${dex}:`,
              e
            );
          } finally {
            const duration = Date.now() - t0;
            try {
              const { logger } = await import("@/utils/logger");
              logger.debug(
                { dex, duration },
                "[GetPortfolioUseCase] enrichment timing"
              );
            } catch {}
          }
        })
      );
    }

    const portfolio = Portfolio.create(userId, dbPositions);

    // Cache serialized positions snapshot for 5 minutes
    try {
      const serialized = dbPositions.map((p) => ({
        id: p.id,
        userId: p.userId,
        positionAddress: p.positionAddress,
        poolAddress: p.poolAddress,
        dex: p.dex,
        strategyType: p.strategyType,
        tokenX: p.tokenX,
        tokenY: p.tokenY,
        status: p.getStatus(),
        initialValueUsd: p.getInitialValue().toNumber(),
        currentValueUsd: p.getCurrentValue().toNumber(),
        initialTokenXAmount: p.getInitialTokenXAmount().toUi().toString(),
        initialTokenYAmount: p.getInitialTokenYAmount().toUi().toString(),
        currentTokenXAmount: p.getCurrentTokenXAmount().toUi().toString(),
        currentTokenYAmount: p.getCurrentTokenYAmount().toUi().toString(),
        claimedFeesUsd: p.getClaimedFees().toNumber(),
        priceRange: p.getPriceRange()
          ? {
              min: (p.getPriceRange() as any)["min"],
              max: (p.getPriceRange() as any)["max"],
            }
          : null,
        isRebalancingEnabled: (p as any)["isRebalancingEnabled"] ?? false,
        rebalanceThreshold: (p as any)["rebalanceThreshold"] ?? 20,
        createdAt: p.createdAt,
        updatedAt: p.getUpdatedAt(),
        closedAt: p.getClosedAt(),
        transactionSignature: p.getTransactionSignature(),
      }));
      await this.cache.set(
        cacheKey,
        { serialized: { positions: serialized } },
        300
      );
    } catch (e) {
      console.warn("[GetPortfolioUseCase] Cache set failed:", e);
    }

    try {
      const { logger } = await import("@/utils/logger");
      const dur = Date.now() - tStart;
      logger.debug({ userId, dur }, "[GetPortfolioUseCase] total timing");
    } catch {}
    return portfolio;
  }
}
