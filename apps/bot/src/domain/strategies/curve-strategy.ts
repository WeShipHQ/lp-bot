/**
 * Curve Strategy Implementation
 * 
 * Concentrates liquidity in the middle of the price range.
 * Optimal for stable pairs with low price volatility.
 */

import { DexType } from "@/types/core.types";
import { OPEN_POSITION_FEE, SOL_MINT } from "@/config/constants";
import { DEFAULT_BIN_RANGE } from "@/domain/user/constants";
import { BaseLPStrategy } from "./base-strategy";
import {
  StrategyMetadata,
  StrategyName,
  CalculateDepositPlanParams,
  DepositPlan,
  DexStrategyParams,
  ValidationResult,
  ValidateStrategyParams,
} from "./types";

export class CurveStrategy extends BaseLPStrategy {
  readonly metadata: StrategyMetadata = {
    name: "curve" as StrategyName,
    displayName: "Curve",
    description: "Concentrates liquidity in the middle of the range",
    details:
      "Efficient strategy for stable pairs (e.g., USDC/USDT) that concentrates liquidity " +
      "around the current price. Maximizes fee earnings with less capital but requires more " +
      "frequent rebalancing when price moves significantly.",
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
      "Stable pairs (e.g., USDC/USDT)",
      "Low volatility markets",
      "Capital efficiency",
      "Active management",
    ],
    riskLevel: 3,
    beginnerFriendly: false,
    defaultRangeInterval: Math.floor(DEFAULT_BIN_RANGE / 2), // Tighter range
    compatibleDexes: ["meteora", "saros"],
  };

  protected async validateStrategy(
    params: ValidateStrategyParams
  ): Promise<ValidationResult> {
    const warnings: string[] = [];

    // Curve strategy needs more careful consideration
    warnings.push(
      "Curve strategy concentrates liquidity - may require frequent rebalancing"
    );

    if (params.depositMode !== "sol_auto_convert") {
      warnings.push(
        "Single-sided curve positions may go out of range quickly in volatile markets"
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
      priceChangePercentage = 5, // Tighter default range for curve (5%)
      rangeInterval,
    } = params;

    // Calculate range interval if not provided (tighter range for curve)
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

        const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
        const netAmount = solAmount - feeAmount;
        const halfAmount = netAmount / 2;

        finalTokenAAmount = tokenAAmount || 0;
        finalTokenBAmount = tokenBAmount || 0;

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
      throw new Error(`Curve strategy does not support DEX: ${dex}`);
    }

    switch (dex) {
      case "meteora":
      case "saros":
        return {
          dex,
          params: {
            strategyType: "Curve", // Meteora SDK's StrategyType.Curve
            rangeInterval: depositPlan.priceRange?.rangeInterval,
          },
        };

      case "orca":
      case "raydium":
        return {
          dex,
          params: {
            strategyType: "curve",
            priceRange: depositPlan.priceRange,
          },
        };

      default:
        throw new Error(`Unsupported DEX: ${dex}`);
    }
  }
}
