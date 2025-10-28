import { DexType } from "@/types/core.types";
import { meteoraDlmmService } from "@/adapters/dex/meteora";
import { SarosDlmmService } from "@/services/saros/dlmm.service";

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
 * Delegates to the appropriate underlying service based on dex type.
 */
// FIXME use DI to get dex registry
export class GetPriceRangeUseCase {
  private readonly saros = new SarosDlmmService();
  async execute(input: GetPriceRangeInput): Promise<PriceRangeResult> {
    const { poolAddress, dex, rangeInterval } = input;

    if (dex === "saros") {
      return this.saros.getPriceRange(poolAddress, rangeInterval);
    }

    // Default to meteora (current focus)
    return meteoraDlmmService.getPriceRange(poolAddress, rangeInterval);
  }
}
