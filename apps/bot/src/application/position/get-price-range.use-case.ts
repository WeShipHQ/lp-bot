import { DexType } from "@/types/core.types";
import { dexRegistry } from "@/services/dex-registry.service";
import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";
import { SarosAdapter } from "@/adapters/dex/saros.adapter";

export interface GetPriceRangeInput {
  poolAddress: string;
  dex: DexType;
  rangeInterval: number;
}

export interface PriceRangeResult {
  fromPrice: string;
  toPrice: string;
}

/**
 * Application-level wrapper to compute DLMM price range for a given pool and bin interval.
 * Uses DexRegistry to get the appropriate adapter and delegates to it.
 * 
 * This is DEX-agnostic and works with any adapter that implements getPriceRange.
 */
export class GetPriceRangeUseCase {
  async execute(input: GetPriceRangeInput): Promise<PriceRangeResult> {
    const { poolAddress, dex, rangeInterval } = input;

    // Get the appropriate DEX adapter from registry
    const adapter = dexRegistry.get(dex);

    // Adapter-specific logic: MeteoraAdapter and SarosAdapter should implement getPriceRange
    // For now, we cast to the specific type since getPriceRange is not in the base interface yet
    if (adapter instanceof MeteoraAdapter) {
      return adapter.getPriceRange(poolAddress, rangeInterval);
    }

    if (adapter instanceof SarosAdapter) {
      return adapter.getPriceRange(poolAddress, rangeInterval);
    }

    throw new Error(`Price range calculation not supported for DEX: ${dex}`);
  }
}
