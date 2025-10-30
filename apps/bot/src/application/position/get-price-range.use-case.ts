import { DexType } from "@/types/core.types";
import { dexRegistry } from "@/services/dex-registry.service";
import Decimal from "decimal.js";

export interface GetPriceRangeInput {
  poolAddress: string;
  dex: DexType;
  rangeInterval: number;
}

export interface PriceRangeResult {
  fromPrice: Decimal;
  toPrice: Decimal;
}

export class GetPriceRangeUseCase {
  async execute(input: GetPriceRangeInput): Promise<PriceRangeResult> {
    const { poolAddress, dex, rangeInterval } = input;

    const adapter = dexRegistry.get(dex);

    return adapter.getPriceRange(poolAddress, rangeInterval);
  }
}
