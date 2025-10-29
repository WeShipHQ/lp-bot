import { 
  UnifiedPosition, 
  PositionWithPrices, 
  UserPosition,
  UnifiedPortfolio,
  DexType,
  TokenPrice
} from "@/types/core.types";
import { getTokenPriceService, TokenPriceService } from "./token-price.service";
import { logger } from "@/utils/logger";
import { Position } from "@/domain/position/position.entity";

/**
 * PriceEnrichmentService
 * 
 * Centralized service responsible for:
 * - Fetching token prices via existing TokenPriceService
 * - Translating raw token amounts to USD values
 * - Computing P&L and fee metrics
 * - Enriching raw UnifiedPosition data into PositionWithPrices
 * - Building enriched UnifiedPortfolio from positions
 * 
 * Design principles:
 * - No internal caching (delegates to TokenPriceService)
 * - Pure calculation functions where possible
 * - Batch price fetching for efficiency
 * - Defensive programming with fallbacks for missing price data
 */
export class PriceEnrichmentService {
  private readonly priceService: TokenPriceService;

  constructor(priceService?: TokenPriceService) {
    this.priceService = priceService ?? getTokenPriceService();
  }

  /**
   * Enrich a single UnifiedPosition with price data and USD calculations
   * 
   * @param position - Raw position data from DEX adapter (token amounts only)
   * @param prices - Optional pre-fetched prices to avoid redundant API calls
   * @returns PositionWithPrices including currentValueUsd and fee calculations
   */
  async enrichPosition(
    position: UnifiedPosition,
    prices?: Record<string, TokenPrice>
  ): Promise<PositionWithPrices> {
    // Fetch prices if not provided
    const priceMap = prices ?? await this.fetchPrices([
      position.tokenA.address,
      position.tokenB.address,
    ]);

    const tokenAPrice = priceMap[position.tokenA.address]?.price ?? 0;
    const tokenBPrice = priceMap[position.tokenB.address]?.price ?? 0;

    // Calculate token amounts in UI units
    const tokenAUi = parseFloat(position.tokenAAmount);
    const tokenBUi = parseFloat(position.tokenBAmount);

    // Calculate current USD value
    const currentValueUsd = (tokenAUi * tokenAPrice) + (tokenBUi * tokenBPrice);

    // Extract fee amounts from metadata if available
    const metadata = position.metadata ?? {};
    const unclaimedFeesUsd = this.calculateFeesUsd(
      metadata.unclaimedFeeX,
      metadata.unclaimedFeeY,
      tokenAPrice,
      tokenBPrice,
      position.tokenA.decimals,
      position.tokenB.decimals
    );

    const claimedFeesUsd = this.calculateFeesUsd(
      metadata.claimedFeeX,
      metadata.claimedFeeY,
      tokenAPrice,
      tokenBPrice,
      position.tokenA.decimals,
      position.tokenB.decimals
    );

    const unclaimedRewardsUsd = this.calculateFeesUsd(
      metadata.unclaimedRewardX,
      metadata.unclaimedRewardY,
      tokenAPrice,
      tokenBPrice,
      position.tokenA.decimals,
      position.tokenB.decimals
    );

    const claimedRewardsUsd = this.calculateFeesUsd(
      metadata.claimedRewardX,
      metadata.claimedRewardY,
      tokenAPrice,
      tokenBPrice,
      position.tokenA.decimals,
      position.tokenB.decimals
    );

    return {
      ...position,
      currentValueUsd,
      unclaimedFeesUsd,
      claimedFeesUsd,
      unclaimedRewardsUsd,
      claimedRewardsUsd,
    };
  }

  /**
   * Enrich a domain Position entity to UserPosition with full P&L calculation
   * 
   * @param position - Domain entity with historical context (initial value)
   * @param onchainPosition - Optional enriched on-chain data
   * @param prices - Optional pre-fetched prices
   * @returns UserPosition with complete P&L metrics
   */
  async enrichDomainPosition(
    position: Position,
    onchainPosition?: PositionWithPrices,
    prices?: Record<string, TokenPrice>
  ): Promise<UserPosition> {
    // Fetch prices if not provided
    const priceMap = prices ?? await this.fetchPrices([
      position.tokenX.address,
      position.tokenY.address,
    ]);

    const tokenAPrice = priceMap[position.tokenX.address]?.price ?? 0;
    const tokenBPrice = priceMap[position.tokenY.address]?.price ?? 0;

    // Get current token amounts (from on-chain if available, otherwise DB)
    const tokenAUi = onchainPosition 
      ? parseFloat(onchainPosition.tokenAAmount)
      : position.getCurrentTokenXAmount().toUi();
    const tokenBUi = onchainPosition
      ? parseFloat(onchainPosition.tokenBAmount)
      : position.getCurrentTokenYAmount().toUi();

    // Calculate current USD value
    const currentValueUsd = (tokenAUi * tokenAPrice) + (tokenBUi * tokenBPrice);

    // Get initial value and claimed fees from domain entity
    const initialValueUsd = position.getInitialValue().toNumber();
    const claimedFeesUsd = position.getClaimedFees().toNumber();

    // Get unclaimed fees from on-chain data if available
    const unclaimedFeesUsd = onchainPosition?.unclaimedFeesUsd ?? 0;
    const unclaimedRewardsUsd = onchainPosition?.unclaimedRewardsUsd ?? 0;
    const claimedRewardsUsd = onchainPosition?.claimedRewardsUsd ?? 0;

    // Calculate P&L
    const { pnlUsd, pnlPercentage } = this.calculatePnL(
      initialValueUsd,
      currentValueUsd,
      claimedFeesUsd,
      unclaimedFeesUsd
    );

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
      inRange: onchainPosition?.inRange ?? true,
      isActive: position.getStatus() === "ACTIVE",
      createdAt: position.createdAt,
      updatedAt: position.getUpdatedAt(),
      metadata: onchainPosition?.metadata,
      currentValueUsd,
      unclaimedFeesUsd,
      claimedFeesUsd,
      unclaimedRewardsUsd,
      claimedRewardsUsd,
      initialValueUsd,
      pnlUsd,
      pnlPercentage,
    };
  }

  /**
   * Enrich multiple positions in batch (efficient price fetching)
   * 
   * @param positions - Array of raw UnifiedPosition data
   * @returns Array of PositionWithPrices
   */
  async enrichPositions(
    positions: UnifiedPosition[]
  ): Promise<PositionWithPrices[]> {
    if (positions.length === 0) return [];

    // Collect all unique token addresses for batch price fetch
    const tokenAddresses = new Set<string>();
    for (const pos of positions) {
      tokenAddresses.add(pos.tokenA.address);
      tokenAddresses.add(pos.tokenB.address);
    }

    // Batch fetch all prices
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
    const totalPnlUsd = enrichedPositions.reduce(
      (sum, p) => sum + p.pnlUsd, 
      0
    );
    const totalFeesUsd = enrichedPositions.reduce(
      (sum, p) => sum + p.claimedFeesUsd + p.unclaimedFeesUsd, 
      0
    );
    const totalRewardsUsd = enrichedPositions.reduce(
      (sum, p) => sum + (p.claimedRewardsUsd ?? 0) + (p.unclaimedRewardsUsd ?? 0), 
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
      totalRewardsUsd,
      dexBreakdown,
    };
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
    const pnlPercentage = initialValueUsd > 0 
      ? (pnlUsd / initialValueUsd) * 100 
      : 0;

    return { pnlUsd, pnlPercentage };
  }

  /**
   * Calculate USD value of fees from raw token amounts
   * 
   * @param feeX - Fee amount in token X (in raw or UI units based on metadata)
   * @param feeY - Fee amount in token Y (in raw or UI units based on metadata)
   * @param priceX - Token X price in USD
   * @param priceY - Token Y price in USD
   * @param decimalsX - Token X decimals (for conversion if needed)
   * @param decimalsY - Token Y decimals (for conversion if needed)
   * @returns Total fees in USD
   */
  private calculateFeesUsd(
    feeX: number | string | undefined,
    feeY: number | string | undefined,
    priceX: number,
    priceY: number,
    decimalsX: number,
    decimalsY: number
  ): number {
    const feeXNum = typeof feeX === "string" ? parseFloat(feeX) : (feeX ?? 0);
    const feeYNum = typeof feeY === "string" ? parseFloat(feeY) : (feeY ?? 0);

    // Assume fees are already in UI units (adjust if adapters provide raw amounts)
    const feeXUsd = feeXNum * priceX;
    const feeYUsd = feeYNum * priceY;

    return feeXUsd + feeYUsd;
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
    const breakdown: Record<string, { positions: number; valueUsd: number; pnlUsd: number }> = {};

    for (const pos of positions) {
      if (!breakdown[pos.dex]) {
        breakdown[pos.dex] = { positions: 0, valueUsd: 0, pnlUsd: 0 };
      }

      breakdown[pos.dex].positions += 1;
      breakdown[pos.dex].valueUsd += pos.currentValueUsd;
      breakdown[pos.dex].pnlUsd += pos.pnlUsd;
    }

    return breakdown as Record<DexType, { positions: number; valueUsd: number; pnlUsd: number }>;
  }

  /**
   * Create an empty portfolio structure
   */
  private createEmptyPortfolio(userAddress: string): UnifiedPortfolio {
    return {
      userAddress,
      positions: [],
      totalValueUsd: 0,
      totalPnlUsd: 0,
      totalFeesUsd: 0,
      totalRewardsUsd: 0,
      dexBreakdown: {} as any,
    };
  }

  /**
   * Fetch token prices via TokenPriceService
   * Handles errors gracefully by returning 0 for missing prices
   * 
   * @param tokenAddresses - Array of token mint addresses
   * @returns Map of token address to TokenPrice (or undefined if unavailable)
   */
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
      // Return empty map - enrichment methods will default to 0 for missing prices
      return {};
    }
  }
}

// Singleton instance for convenience
let enrichmentServiceInstance: PriceEnrichmentService | null = null;

export function createPriceEnrichmentService(
  priceService?: TokenPriceService
): PriceEnrichmentService {
  if (!enrichmentServiceInstance) {
    enrichmentServiceInstance = new PriceEnrichmentService(priceService);
  }
  return enrichmentServiceInstance;
}

export function getPriceEnrichmentService(): PriceEnrichmentService {
  if (!enrichmentServiceInstance) {
    enrichmentServiceInstance = new PriceEnrichmentService();
  }
  return enrichmentServiceInstance;
}
