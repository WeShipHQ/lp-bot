import {
  UnifiedPosition,
  PositionWithPrices,
  UserPosition,
  UnifiedPortfolio,
  DexType,
  TokenPrice,
} from "@/types/core.types";
import { getTokenPriceService, TokenPriceService } from "./token-price.service";
import { logger } from "@/utils/logger";
import { Position } from "@/domain/position/position.entity";
import Decimal from "decimal.js";

export class PriceEnrichmentService {
  private readonly priceService: TokenPriceService;

  constructor(priceService?: TokenPriceService) {
    this.priceService = priceService ?? getTokenPriceService();
  }

  async enrichPosition(
    position: UnifiedPosition,
    prices?: Record<string, TokenPrice>
  ): Promise<PositionWithPrices> {
    const priceMap =
      prices ??
      (await this.fetchPrices([
        position.tokenA.address,
        position.tokenB.address,
      ]));

    const tokenAPrice = priceMap[position.tokenA.address]?.price ?? 0;
    const tokenBPrice = priceMap[position.tokenB.address]?.price ?? 0;

    // Calculate token amounts in UI units
    const tokenADecimal = new Decimal(position.tokenAAmount);
    const tokenBDecimal = new Decimal(position.tokenBAmount);

    const currentValueUsd = tokenADecimal
      .mul(tokenAPrice)
      .add(tokenBDecimal.times(tokenBPrice))
      .toNumber();

    const unclaimedFeesUsdDecimal = new Decimal(position.unclaimedFeesX)
      .mul(tokenAPrice)
      .add(new Decimal(position.unclaimedFeesY).mul(tokenBPrice));

    const claimedFeesUsdDecimal = new Decimal(position.claimedFeesX)
      .mul(tokenAPrice)
      .add(new Decimal(position.claimedFeesY).mul(tokenBPrice));

    return {
      ...position,
      currentValueUsd,
      unclaimedFeesUsd: unclaimedFeesUsdDecimal.toNumber(),
      claimedFeesUsd: claimedFeesUsdDecimal.toNumber(),
    };
  }

  async enrichDomainPosition(
    position: Position,
    onchainPosition?: PositionWithPrices | null,
    prices?: Record<string, TokenPrice>
  ): Promise<UserPosition> {
    const priceMap =
      prices ??
      (await this.fetchPrices([
        position.tokenX.address,
        position.tokenY.address,
      ]));

    const tokenAPrice = priceMap[position.tokenX.address]?.price ?? 0;
    const tokenBPrice = priceMap[position.tokenY.address]?.price ?? 0;

    const tokenAUi = onchainPosition
      ? parseFloat(onchainPosition.tokenAAmount)
      : position.getCurrentTokenXAmount().toUi();
    const tokenBUi = onchainPosition
      ? parseFloat(onchainPosition.tokenBAmount)
      : position.getCurrentTokenYAmount().toUi();

    const currentValueUsd = new Decimal(tokenAUi)
      .mul(tokenAPrice)
      .add(new Decimal(tokenBUi).times(tokenBPrice))
      .toNumber();

    const initialValueUsd = position.getInitialValue().toNumber();

    const unclaimedFeesUsdDecimal = new Decimal(
      onchainPosition?.unclaimedFeesX ?? "0"
    )
      .mul(tokenAPrice)
      .add(
        new Decimal(onchainPosition?.unclaimedFeesY ?? "0").mul(tokenBPrice)
      );

    const claimedFeesUsdDecimal = new Decimal(
      onchainPosition?.claimedFeesX ?? "0"
    )
      .mul(tokenAPrice)
      .add(new Decimal(onchainPosition?.claimedFeesY ?? "0").mul(tokenBPrice));

    const { pnlUsd, pnlPercentage } = this.calculatePnL(
      initialValueUsd,
      currentValueUsd,
      claimedFeesUsdDecimal.toNumber(),
      unclaimedFeesUsdDecimal.toNumber()
    );

    const durationDays = this.calculateDurationDays(position.createdAt);

    return {
      id: position.id,
      address: position.positionAddress,
      poolAddress: position.poolAddress,
      dex: position.dex as DexType,
      type: position.strategyType as any,
      tokenA: {
        address: position.tokenX.address,
        symbol: position.tokenX.symbol,
        name: position.tokenX.symbol,
        decimals: position.tokenX.decimals,
        logoUri: position.tokenX.logoURI,
      },
      tokenB: {
        address: position.tokenY.address,
        symbol: position.tokenY.symbol,
        name: position.tokenY.symbol,
        decimals: position.tokenY.decimals,
        logoUri: position.tokenY.logoURI,
      },
      tokenAAmount: position.getCurrentTokenXAmount().toUi().toString(),
      tokenBAmount: position.getCurrentTokenYAmount().toUi().toString(),
      claimedFeesX: onchainPosition?.claimedFeesX ?? "0",
      claimedFeesY: onchainPosition?.claimedFeesY ?? "0",
      unclaimedFeesY: onchainPosition?.unclaimedFeesY ?? "0",
      unclaimedFeesX: onchainPosition?.unclaimedFeesX ?? "0",
      inRange: onchainPosition?.inRange ?? true,
      isActive: position.getStatus() === "ACTIVE",
      createdAt: position.createdAt,
      updatedAt: position.getUpdatedAt(),
      metadata: onchainPosition?.metadata,
      currentValueUsd,
      unclaimedFeesUsd: unclaimedFeesUsdDecimal.toNumber(),
      claimedFeesUsd: claimedFeesUsdDecimal.toNumber(),
      initialValueUsd,
      pnlUsd,
      pnlPercentage,
      status: position.getStatus(),
      metrics: {
        claimedFeesUsd: claimedFeesUsdDecimal.toNumber(),
        totalPnlUsd: pnlUsd,
        durationDays,
        rebalanceCount: 0,
      },
    };
  }

  async enrichPositions(
    positions: UnifiedPosition[]
  ): Promise<PositionWithPrices[]> {
    if (positions.length === 0) return [];

    const tokenAddresses = new Set<string>();
    for (const pos of positions) {
      tokenAddresses.add(pos.tokenA.address);
      tokenAddresses.add(pos.tokenB.address);
    }

    const prices = await this.fetchPrices(Array.from(tokenAddresses));

    // Enrich each position with the shared price map
    return Promise.all(
      positions.map((pos) => this.enrichPosition(pos, prices))
    );
  }

  /**
   * Build enriched UnifiedPortfolio from domain Position entities
   *
   * @param userAddress - Wallet address
   * @param positions - Array of domain Position entities
   * @param onchainPositions - Optional map of on-chain position data keyed by address
   * @returns Complete UnifiedPortfolio with aggregated metrics
   */
  async buildPortfolio(
    userAddress: string,
    positions: Position[],
    onchainPositions?: Map<string, PositionWithPrices>
  ): Promise<UnifiedPortfolio> {
    if (positions.length === 0) {
      return this.createEmptyPortfolio(userAddress);
    }

    // Collect all unique token addresses for batch price fetch
    const tokenAddresses = new Set<string>();
    for (const pos of positions) {
      tokenAddresses.add(pos.tokenX.address);
      tokenAddresses.add(pos.tokenY.address);
    }

    // Batch fetch all prices
    const prices = await this.fetchPrices(Array.from(tokenAddresses));

    // Enrich all positions
    const enrichedPositions: UserPosition[] = [];
    for (const pos of positions) {
      const onchain = onchainPositions?.get(pos.positionAddress);
      const enriched = await this.enrichDomainPosition(pos, onchain, prices);
      enrichedPositions.push(enriched);
    }

    // Calculate portfolio-level aggregations
    const totalValueUsd = enrichedPositions.reduce(
      (sum, p) => sum + p.currentValueUsd,
      0
    );
    const totalPnlUsd = enrichedPositions.reduce((sum, p) => sum + p.pnlUsd, 0);
    const totalFeesUsd = enrichedPositions.reduce(
      (sum, p) => sum + p.claimedFeesUsd + p.unclaimedFeesUsd,
      0
    );

    // Build DEX breakdown
    const dexBreakdown = this.calculateDexBreakdown(enrichedPositions);

    return {
      userAddress,
      positions: enrichedPositions,
      totalValueUsd,
      totalPnlUsd,
      totalFeesUsd,
      dexBreakdown,
    };
  }

  /**
   * Calculate duration in days since position creation
   */
  private calculateDurationDays(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.round(diffDays * 100) / 100);
  }

  /**
   * Calculate P&L metrics from USD values
   *
   * @param initialValueUsd - Initial position value
   * @param currentValueUsd - Current position value
   * @param claimedFeesUsd - Total claimed fees
   * @param unclaimedFeesUsd - Total unclaimed fees
   * @returns P&L in USD and percentage
   */
  private calculatePnL(
    initialValueUsd: number,
    currentValueUsd: number,
    claimedFeesUsd: number,
    unclaimedFeesUsd: number
  ): { pnlUsd: number; pnlPercentage: number } {
    // P&L = (Current Value + All Fees) - Initial Value
    const totalValue = currentValueUsd + claimedFeesUsd + unclaimedFeesUsd;
    const pnlUsd = totalValue - initialValueUsd;
    const pnlPercentage =
      initialValueUsd > 0 ? (pnlUsd / initialValueUsd) * 100 : 0;

    return { pnlUsd, pnlPercentage };
  }

  /**
   * Calculate breakdown of portfolio metrics by DEX
   *
   * @param positions - Array of enriched UserPosition
   * @returns Map of DEX type to aggregated metrics
   */
  private calculateDexBreakdown(
    positions: UserPosition[]
  ): Record<DexType, { positions: number; valueUsd: number; pnlUsd: number }> {
    const breakdown: Record<
      string,
      { positions: number; valueUsd: number; pnlUsd: number }
    > = {};

    for (const pos of positions) {
      if (!breakdown[pos.dex]) {
        breakdown[pos.dex] = { positions: 0, valueUsd: 0, pnlUsd: 0 };
      }

      breakdown[pos.dex].positions += 1;
      breakdown[pos.dex].valueUsd += pos.currentValueUsd;
      breakdown[pos.dex].pnlUsd += pos.pnlUsd;
    }

    return breakdown as Record<
      DexType,
      { positions: number; valueUsd: number; pnlUsd: number }
    >;
  }

  private createEmptyPortfolio(userAddress: string): UnifiedPortfolio {
    return {
      userAddress,
      positions: [],
      totalValueUsd: 0,
      totalPnlUsd: 0,
      totalFeesUsd: 0,
      dexBreakdown: {} as any,
    };
  }

  private async fetchPrices(
    tokenAddresses: string[]
  ): Promise<Record<string, TokenPrice>> {
    if (tokenAddresses.length === 0) return {};

    try {
      const prices = await this.priceService.getPrices(tokenAddresses);
      return prices;
    } catch (error) {
      logger.warn(
        { error, tokenAddresses },
        "[PriceEnrichmentService] Failed to fetch prices, using fallback zeros"
      );
      return {};
    }
  }
}

/**
 * Note: PriceEnrichmentService should be obtained from the DI container
 * instead of using these helper functions. These are provided for backwards
 * compatibility during migration.
 *
 * @deprecated Use container.get(PriceEnrichmentService) instead
 */
let enrichmentServiceInstance: PriceEnrichmentService | null = null;

/**
 * @deprecated Use container.get(PriceEnrichmentService) instead
 */
export function getPriceEnrichmentService(): PriceEnrichmentService {
  if (!enrichmentServiceInstance) {
    enrichmentServiceInstance = new PriceEnrichmentService();
  }
  return enrichmentServiceInstance;
}
