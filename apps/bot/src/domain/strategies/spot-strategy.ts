/**
 * Spot Strategy Implementation
 * 
 * Evenly distributes liquidity across the price range.
 * Beginner-friendly and suitable for volatile pairs.
 */

import { DexType } from "@/types/core.types";
import { SOL_MINT, OPEN_POSITION_FEE } from "@/config/constants";
import { DEFAULT_BIN_RANGE } from "@/domain/user/constants";
import { BaseLPStrategy } from "./base-strategy";
import {
  StrategyMetadata,
  StrategyName,
  DepositMode,
  CalculateDepositPlanParams,
  DepositPlan,
  DexStrategyParams,
  ValidationResult,
  ValidateStrategyParams,
} from "./types";

export class SpotStrategy extends BaseLPStrategy {
  readonly metadata: StrategyMetadata = {
    name: "spot" as StrategyName,
    displayName: "Spot",
    description: "Evenly spreads liquidity across the range",
    details:
      "Beginner-friendly strategy that distributes liquidity uniformly across the price range. " +
      "Ideal for volatile pairs with uncertain price direction. Provides consistent fee earning " +
      "potential with minimal need for rebalancing.",
    supportedDepositModes: ["sol_auto_convert", "single_token_a", "single_token_b"],
    tokenRequirements: {
      balanced: [
        { token: "A", required: true },
        { token: "B", required: true },
      ],
      singleSidedA: [
        { token: "A", required: true },
        { token: "B", required: false },
      ],
      singleSidedB: [
        { token: "A", required: false },
        { token: "B", required: true },
      ],
    },
    recommendedFor: [
      "Beginners",
      "Volatile pairs",
      "Uncertain price direction",
      "Long-term positions",
    ],
    riskLevel: 2,
    beginnerFriendly: true,
    defaultRangeInterval: DEFAULT_BIN_RANGE,
    compatibleDexes: ["meteora", "saros"],
  };

  protected async validateStrategy(
    params: ValidateStrategyParams
  ): Promise<ValidationResult> {
    const warnings: string[] = [];

    // Spot strategy is very flexible, mainly add warnings
    if (params.depositMode === "sol_auto_convert") {
      // No specific warnings for balanced mode
    } else {
      warnings.push(
        "Single-sided deposits may result in higher impermanent loss in volatile markets"
      );
    }

    return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
  }

  async calculateDepositPlan(
    params: CalculateDepositPlanParams
  ): Promise<DepositPlan> {
    const {
      depositMode,
      solAmount,
      tokenAAmount,
      tokenBAmount,
      tokenA,
      tokenB,
      currentPrice,
      priceChangePercentage = 10, // Default 10% range
      rangeInterval,
    } = params;

    // Calculate range interval if not provided
    const finalRangeInterval =
      rangeInterval ?? this.calculateRangeInterval(priceChangePercentage);

    // Calculate price range
    const priceRange = this.calculatePriceRange(
      currentPrice,
      finalRangeInterval
    );

    let finalTokenAAmount: number;
    let finalTokenBAmount: number;
    const swaps: any[] = [];

    switch (depositMode) {
      case "sol_auto_convert": {
        if (!solAmount) {
          throw new Error("SOL amount required for sol_auto_convert mode");
        }

        // Calculate net amount after platform fee
        const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
        const netAmount = solAmount - feeAmount;
        const halfAmount = netAmount / 2;

        // For balanced deposits, we need to convert SOL to both tokens
        // These amounts would be calculated via Jupiter quotes in actual implementation
        // For now, we'll use placeholder logic
        finalTokenAAmount = tokenAAmount || 0;
        finalTokenBAmount = tokenBAmount || 0;

        // Add swap plans if tokens are not SOL
        if (tokenA.address !== SOL_MINT) {
          swaps.push(
            this.createSwapPlan(halfAmount, tokenA.address, finalTokenAAmount)
          );
        } else {
          finalTokenAAmount = halfAmount;
        }

        if (tokenB.address !== SOL_MINT) {
          swaps.push(
            this.createSwapPlan(
              netAmount - halfAmount,
              tokenB.address,
              finalTokenBAmount
            )
          );
        } else {
          finalTokenBAmount = netAmount - halfAmount;
        }

        break;
      }

      case "single_token_a": {
        if (!tokenAAmount) {
          throw new Error("Token A amount required for single_token_a mode");
        }
        finalTokenAAmount = tokenAAmount;
        finalTokenBAmount = 0;
        break;
      }

      case "single_token_b": {
        if (!tokenBAmount) {
          throw new Error("Token B amount required for single_token_b mode");
        }
        finalTokenAAmount = 0;
        finalTokenBAmount = tokenBAmount;
        break;
      }

      default:
        throw new Error(`Unsupported deposit mode: ${depositMode}`);
    }

    return {
      mode: depositMode,
      tokenAAmount: finalTokenAAmount,
      tokenBAmount: finalTokenBAmount,
      swaps: swaps.length > 0 ? swaps : undefined,
      priceRange: {
        min: priceRange.min,
        max: priceRange.max,
        rangeInterval: finalRangeInterval,
      },
      estimatedFees: {
        transactionFee: this.estimateTransactionFee(swaps.length),
        swapFees: swaps.length > 0 ? this.estimateSwapFees(solAmount || 0, swaps.length) : undefined,
        platformFee: solAmount ? solAmount * (OPEN_POSITION_FEE / 100) : undefined,
      },
    };
  }

  async getDexParams(
    dex: DexType,
    depositPlan: DepositPlan
  ): Promise<DexStrategyParams> {
    if (!this.supportsDex(dex)) {
      throw new Error(`Spot strategy does not support DEX: ${dex}`);
    }

    switch (dex) {
      case "meteora":
      case "saros":
        // For DLMM-based DEXes, return strategy type and range
        return {
          dex,
          params: {
            strategyType: "Spot", // Meteora SDK's StrategyType.Spot
            rangeInterval: depositPlan.priceRange?.rangeInterval,
            minBinId: this.calculateMinBinId(
              depositPlan.priceRange?.min,
              depositPlan.priceRange?.rangeInterval
            ),
            maxBinId: this.calculateMaxBinId(
              depositPlan.priceRange?.max,
              depositPlan.priceRange?.rangeInterval
            ),
          },
        };

      case "orca":
      case "raydium":
        // For other DEXes, return generic params
        return {
          dex,
          params: {
            strategyType: "spot",
            priceRange: depositPlan.priceRange,
          },
        };

      default:
        throw new Error(`Unsupported DEX: ${dex}`);
    }
  }

  /**
   * Calculate minimum bin ID from price (DEX-specific helper)
   */
  private calculateMinBinId(
    minPrice?: number,
    rangeInterval?: number
  ): number | undefined {
    if (!minPrice || !rangeInterval) return undefined;
    // This is a simplified calculation - actual implementation would use
    // DEX-specific formulas or SDK methods
    return -rangeInterval;
  }

  /**
   * Calculate maximum bin ID from price (DEX-specific helper)
   */
  private calculateMaxBinId(
    maxPrice?: number,
    rangeInterval?: number
  ): number | undefined {
    if (!maxPrice || !rangeInterval) return undefined;
    return rangeInterval;
  }
}
