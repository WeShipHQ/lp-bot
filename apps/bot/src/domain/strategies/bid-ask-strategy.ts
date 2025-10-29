/**
 * Bid-Ask Strategy Implementation
 * 
 * Provides liquidity on the edges of the price range for directional exposure.
 * Suitable for experienced users targeting specific price movements.
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

export class BidAskStrategy extends BaseLPStrategy {
  readonly metadata: StrategyMetadata = {
    name: "bid-ask" as StrategyName,
    displayName: "Bid-Ask",
    description: "Provides liquidity on one side of the price range",
    details:
      "Advanced strategy that places liquidity at the edges of the price range, " +
      "allowing directional exposure. High fee potential but increased impermanent loss risk. " +
      "Ideal for single-sided DCA strategies.",
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
      "Experienced traders",
      "Directional bets",
      "Single-sided liquidity",
      "Specific price targeting",
    ],
    riskLevel: 4,
    beginnerFriendly: false,
    defaultRangeInterval: Math.floor(DEFAULT_BIN_RANGE * 1.5), // Wider range for bid-ask
    compatibleDexes: ["meteora", "saros"],
  };

  protected async validateStrategy(
    params: ValidateStrategyParams
  ): Promise<ValidationResult> {
    const warnings: string[] = [];

    warnings.push(
      "Bid-Ask strategy provides directional exposure. Monitor price movements closely."
    );

    if (params.depositMode === "sol_auto_convert") {
      warnings.push(
        "Balanced deposits with Bid-Ask may dilute directional exposure. Consider single-sided deposits."
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
      priceChangePercentage = 20, // Wider range for bid-ask (20%)
      rangeInterval,
    } = params;

    const finalRangeInterval =
      rangeInterval ?? this.calculateRangeInterval(priceChangePercentage);

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

        // For bid-ask, we typically place liquidity on one side at a time
        // We'll split 75/25 to emphasize one side but keep some liquidity on the other
        const tokenAAllocation = netAmount * 0.75;
        const tokenBAllocation = netAmount * 0.25;

        finalTokenAAmount = tokenAAmount || 0;
        finalTokenBAmount = tokenBAmount || 0;

        if (tokenA.address !== SOL_MINT) {
          swaps.push(
            this.createSwapPlan(tokenAAllocation, tokenA.address, finalTokenAAmount)
          );
        } else {
          finalTokenAAmount = tokenAAllocation;
        }

        if (tokenB.address !== SOL_MINT) {
          swaps.push(
            this.createSwapPlan(tokenBAllocation, tokenB.address, finalTokenBAmount)
          );
        } else {
          finalTokenBAmount = tokenBAllocation;
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
      throw new Error(`Bid-Ask strategy does not support DEX: ${dex}`);
    }

    switch (dex) {
      case "meteora":
      case "saros":
        return {
          dex,
          params: {
            strategyType: "BidAsk", // Meteora SDK's StrategyType.BidAsk
            rangeInterval: depositPlan.priceRange?.rangeInterval,
          },
        };

      case "orca":
      case "raydium":
        return {
          dex,
          params: {
            strategyType: "bid-ask",
            priceRange: depositPlan.priceRange,
          },
        };

      default:
        throw new Error(`Unsupported DEX: ${dex}`);
    }
  }
}
