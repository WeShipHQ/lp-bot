/**
 * Base LP Strategy Implementation
 * 
 * Provides common functionality for all LP strategies
 */

import { DexType } from "@/types/core.types";
import { SOL_MINT } from "@/config/constants";
import { DEFAULT_BIN_RANGE } from "@/domain/user/constants";
import {
  ILPStrategy,
  StrategyMetadata,
  ValidationResult,
  ValidateStrategyParams,
  CalculateDepositPlanParams,
  DepositPlan,
  DexStrategyParams,
  DepositMode,
  SwapPlan,
} from "./types";

/**
 * Abstract base class for LP strategies
 * Provides common validation and helper methods
 */
export abstract class BaseLPStrategy implements ILPStrategy {
  abstract readonly metadata: StrategyMetadata;

  /**
   * Validate common strategy parameters
   */
  async validate(params: ValidateStrategyParams): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate deposit mode support
    if (!this.supportsDepositMode(params.depositMode)) {
      errors.push(
        `Strategy "${this.metadata.name}" does not support deposit mode "${params.depositMode}"`
      );
      return { valid: false, error: errors.join("; "), warnings };
    }

    // Validate amounts based on deposit mode
    switch (params.depositMode) {
      case "sol_auto_convert":
        if (!params.solAmount || params.solAmount <= 0) {
          errors.push("SOL amount must be greater than 0 for sol_auto_convert mode");
        }
        if (
          params.solBalance !== undefined &&
          params.solAmount! > params.solBalance
        ) {
          errors.push("Insufficient SOL balance");
        }
        break;

      case "single_token_a":
        if (!params.tokenAAmount || params.tokenAAmount <= 0) {
          errors.push("Token A amount must be greater than 0 for single_token_a mode");
        }
        if (
          params.tokenABalance !== undefined &&
          params.tokenAAmount! > params.tokenABalance
        ) {
          errors.push("Insufficient Token A balance");
        }
        break;

      case "single_token_b":
        if (!params.tokenBAmount || params.tokenBAmount <= 0) {
          errors.push("Token B amount must be greater than 0 for single_token_b mode");
        }
        if (
          params.tokenBBalance !== undefined &&
          params.tokenBAmount! > params.tokenBBalance
        ) {
          errors.push("Insufficient Token B balance");
        }
        break;
    }

    // Check minimum deposit if specified
    if (params.minimumDeposit) {
      const totalValue =
        (params.tokenAAmount || 0) + (params.tokenBAmount || 0) + (params.solAmount || 0);
      if (totalValue < params.minimumDeposit) {
        errors.push(
          `Total deposit (${totalValue}) is below minimum (${params.minimumDeposit})`
        );
      }
    }

    // Add strategy-specific validation
    const strategyValidation = await this.validateStrategy(params);
    if (!strategyValidation.valid) {
      errors.push(strategyValidation.error || "Strategy validation failed");
    }
    if (strategyValidation.warnings) {
      warnings.push(...strategyValidation.warnings);
    }

    if (errors.length > 0) {
      return {
        valid: false,
        error: errors.join("; "),
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Strategy-specific validation (override in subclasses)
   */
  protected async validateStrategy(
    params: ValidateStrategyParams
  ): Promise<ValidationResult> {
    return { valid: true };
  }

  abstract calculateDepositPlan(
    params: CalculateDepositPlanParams
  ): Promise<DepositPlan>;

  abstract getDexParams(
    dex: DexType,
    depositPlan: DepositPlan
  ): Promise<DexStrategyParams>;

  supportsDex(dex: DexType): boolean {
    return this.metadata.compatibleDexes.includes(dex);
  }

  supportsDepositMode(mode: DepositMode): boolean {
    return this.metadata.supportedDepositModes.includes(mode);
  }

  /**
   * Calculate range interval based on price change percentage
   * This is a helper method for strategies that support price ranges
   */
  protected calculateRangeInterval(
    priceChangePercentage: number,
    binStep: number = 25
  ): number {
    // Formula: rangeInterval = ln(1 + priceChange/100) / ln(1 + binStep/10000)
    // This converts percentage change to number of bins
    const priceRatio = 1 + priceChangePercentage / 100;
    const binStepRatio = 1 + binStep / 10000;
    const interval = Math.ceil(Math.log(priceRatio) / Math.log(binStepRatio));
    return Math.max(interval, 1); // At least 1 bin
  }

  /**
   * Calculate price range bounds from current price and interval
   */
  protected calculatePriceRange(
    currentPrice: number,
    rangeInterval: number,
    binStep: number = 25
  ): { min: number; max: number } {
    const binStepRatio = 1 + binStep / 10000;
    const lowerMultiplier = Math.pow(binStepRatio, -rangeInterval);
    const upperMultiplier = Math.pow(binStepRatio, rangeInterval);

    return {
      min: currentPrice * lowerMultiplier,
      max: currentPrice * upperMultiplier,
    };
  }

  /**
   * Create swap plan for SOL to token conversion
   */
  protected createSwapPlan(
    inputAmount: number,
    outputMint: string,
    expectedOutput: number
  ): SwapPlan {
    return {
      inputMint: SOL_MINT,
      outputMint,
      amount: inputAmount,
      expectedOutput,
    };
  }

  /**
   * Estimate transaction fees
   * Base estimation, can be overridden by strategies
   */
  protected estimateTransactionFee(swapCount: number = 0): number {
    // Base transaction fee + additional fee per swap
    const baseFee = 0.000005; // 5,000 lamports
    const swapFee = swapCount * 0.0001; // 100,000 lamports per swap
    return baseFee + swapFee;
  }

  /**
   * Estimate swap fees (typically 0.25% per swap)
   */
  protected estimateSwapFees(amount: number, swapCount: number = 1): number {
    const feePerSwap = 0.0025; // 0.25%
    return amount * feePerSwap * swapCount;
  }
}
