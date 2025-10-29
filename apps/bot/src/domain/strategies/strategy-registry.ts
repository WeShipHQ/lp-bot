/**
 * Strategy Registry
 * 
 * Central registry for all LP strategies with compile-time type safety.
 * Ensures exhaustive handling of all strategy types.
 */

import { DexType } from "@/types/core.types";
import { logger } from "@/utils/logger";
import { ILPStrategy, StrategyName, StrategyMetadata } from "./types";
import { SpotStrategy } from "./spot-strategy";
import { CurveStrategy } from "./curve-strategy";
import { BidAskStrategy } from "./bid-ask-strategy";

/**
 * Strategy map type that enforces all strategies are registered
 */
type StrategyMap = {
  [K in StrategyName]: ILPStrategy;
};

/**
 * Strategy Registry class
 * Provides type-safe access to LP strategies
 */
export class StrategyRegistry {
  private strategies: Map<StrategyName, ILPStrategy> = new Map();

  constructor() {
    // Register all strategies - TypeScript ensures we don't miss any
    this.register(new SpotStrategy());
    this.register(new CurveStrategy());
    this.register(new BidAskStrategy());
  }

  /**
   * Register a strategy
   * 
   * @param strategy - The strategy instance to register
   * @throws Error if strategy is already registered
   */
  private register(strategy: ILPStrategy): void {
    if (this.strategies.has(strategy.metadata.name)) {
      throw new Error(
        `Strategy "${strategy.metadata.name}" is already registered`
      );
    }
    this.strategies.set(strategy.metadata.name, strategy);
  }

  /**
   * Get a strategy by name
   * 
   * @param name - Strategy name
   * @returns The strategy instance
   * @throws Error if strategy not found
   */
  get(name: StrategyName): ILPStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      // This should never happen due to TypeScript checks, but we handle it anyway
      throw new Error(
        `Strategy "${name}" not found. Available strategies: ${this.getAvailableStrategies().join(", ")}`
      );
    }
    return strategy;
  }

  /**
   * Get a strategy by name, or return default (Spot) if not found
   * 
   * @param name - Strategy name (may be undefined or unknown)
   * @returns The strategy instance
   */
  getOrDefault(name?: string): ILPStrategy {
    if (!name) {
      return this.get("spot");
    }

    const normalizedName = this.normalizeStrategyName(name);
    
    // Check if it's a valid strategy name
    if (this.isValidStrategyName(normalizedName)) {
      return this.get(normalizedName as StrategyName);
    }

    // Fall back to spot strategy for unknown names
    logger.warn(
      { strategyName: name },
      `Unknown strategy "${name}", falling back to spot strategy`
    );
    return this.get("spot");
  }

  /**
   * Get all registered strategies
   * 
   * @returns Array of all strategy instances
   */
  getAll(): ILPStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get all available strategy names
   * 
   * @returns Array of strategy names
   */
  getAvailableStrategies(): StrategyName[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get metadata for all strategies
   * 
   * @returns Array of strategy metadata
   */
  getAllMetadata(): StrategyMetadata[] {
    return this.getAll().map((s) => s.metadata);
  }

  /**
   * Get strategies compatible with a specific DEX
   * 
   * @param dex - DEX type to filter by
   * @returns Array of compatible strategy instances
   */
  getForDex(dex: DexType): ILPStrategy[] {
    return this.getAll().filter((s) => s.supportsDex(dex));
  }

  /**
   * Get beginner-friendly strategies
   * 
   * @returns Array of beginner-friendly strategy instances
   */
  getBeginnerFriendly(): ILPStrategy[] {
    return this.getAll().filter((s) => s.metadata.beginnerFriendly);
  }

  /**
   * Check if a strategy name is valid
   * 
   * @param name - Name to check
   * @returns Whether the name is a valid strategy
   */
  isValidStrategyName(name: string): boolean {
    return this.strategies.has(name as StrategyName);
  }

  /**
   * Normalize strategy name (handle different formats)
   * 
   * @param name - Strategy name in any format
   * @returns Normalized strategy name
   */
  private normalizeStrategyName(name: string): string {
    const normalized = name.toLowerCase().trim();
    
    // Handle different name formats
    const nameMap: Record<string, StrategyName> = {
      spot: "spot",
      curve: "curve",
      "bid-ask": "bid-ask",
      bidask: "bid-ask",
      bid_ask: "bid-ask",
    };

    return nameMap[normalized] || normalized;
  }

  /**
   * Create a strategy map for exhaustive checking
   * This method helps ensure all strategies are handled in switch statements
   * 
   * @returns Record mapping each strategy name to its instance
   */
  asMap(): StrategyMap {
    const map: Partial<StrategyMap> = {};
    for (const [name, strategy] of this.strategies.entries()) {
      map[name] = strategy;
    }
    // TypeScript ensures all StrategyName keys are present
    return map as StrategyMap;
  }

  /**
   * Get strategy recommendation based on user profile
   * 
   * @param isBeginnerUser - Whether the user is a beginner
   * @param dex - Target DEX (optional)
   * @returns Recommended strategy
   */
  getRecommendation(isBeginnerUser: boolean = true, dex?: DexType): ILPStrategy {
    if (isBeginnerUser) {
      const beginnerStrategies = this.getBeginnerFriendly();
      if (dex) {
        const compatible = beginnerStrategies.filter((s) => s.supportsDex(dex));
        return compatible[0] || this.get("spot");
      }
      return beginnerStrategies[0] || this.get("spot");
    }

    // For experienced users, default to spot as it's most versatile
    return this.get("spot");
  }
}

/**
 * Singleton instance of the strategy registry
 */
export const strategyRegistry = new StrategyRegistry();

/**
 * Type guard to ensure exhaustive checking of strategy names
 * 
 * Usage in switch statements:
 * ```typescript
 * switch (strategyName) {
 *   case "spot": return handleSpot();
 *   case "curve": return handleCurve();
 *   case "bid-ask": return handleBidAsk();
 *   default: return assertNever(strategyName);
 * }
 * ```
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled strategy: ${value}`);
}

/**
 * Helper to map strategy name to Meteora SDK's StrategyType
 * 
 * @param strategyName - Strategy name
 * @returns Meteora SDK strategy type enum value
 */
export function toMeteoraStrategyType(
  strategyName: StrategyName
): "Spot" | "Curve" | "BidAsk" {
  switch (strategyName) {
    case "spot":
      return "Spot";
    case "curve":
      return "Curve";
    case "bid-ask":
      return "BidAsk";
  }

  return assertNever(strategyName);
}
