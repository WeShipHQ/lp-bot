import { ValidationError } from "../shared/errors";
import {
  MAX_BIN_RANGE,
  MAX_REBALANCE_THRESHOLD,
  MAX_SLIPPAGE_PERCENTAGE,
  MAX_STOP_LOSS_PERCENTAGE,
  MAX_TAKE_PROFIT_PERCENTAGE,
  MIN_BIN_RANGE,
  MIN_REBALANCE_THRESHOLD,
  MIN_SLIPPAGE_PERCENTAGE,
  MIN_STOP_LOSS_PERCENTAGE,
  MIN_TAKE_PROFIT_PERCENTAGE,
} from "./constants";
import type { RebalanceSchedule } from "./types";

export class UserValidator {
  static validateRebalanceThreshold(threshold: number): void {
    if (
      threshold < MIN_REBALANCE_THRESHOLD ||
      threshold > MAX_REBALANCE_THRESHOLD
    ) {
      throw new ValidationError(
        `Rebalance threshold must be between ${MIN_REBALANCE_THRESHOLD} and ${MAX_REBALANCE_THRESHOLD}`
      );
    }
  }

  static validateRebalanceSchedule(schedule: RebalanceSchedule): void {
    if (!schedule || String(schedule).trim().length === 0) {
      throw new ValidationError("Rebalance schedule cannot be empty");
    }
  }

  static validateBinRange(binRange: number): void {
    if (binRange < MIN_BIN_RANGE || binRange > MAX_BIN_RANGE) {
      throw new ValidationError(
        `Bin range must be between ${MIN_BIN_RANGE} and ${MAX_BIN_RANGE}`
      );
    }
  }

  static validateStopLossPercentage(percentage: number | null): void {
    if (
      percentage !== null &&
      (percentage < MIN_STOP_LOSS_PERCENTAGE ||
        percentage > MAX_STOP_LOSS_PERCENTAGE)
    ) {
      throw new ValidationError(
        `Stop loss percentage must be between ${MIN_STOP_LOSS_PERCENTAGE} and ${MAX_STOP_LOSS_PERCENTAGE}`
      );
    }
  }

  static validateTakeProfitPercentage(percentage: number | null): void {
    if (
      percentage !== null &&
      (percentage < MIN_TAKE_PROFIT_PERCENTAGE ||
        percentage > MAX_TAKE_PROFIT_PERCENTAGE)
    ) {
      throw new ValidationError(
        `Take profit percentage must be between ${MIN_TAKE_PROFIT_PERCENTAGE} and ${MAX_TAKE_PROFIT_PERCENTAGE}`
      );
    }
  }

  static validateSlippagePercentage(percentage: string | number): number {
    const value =
      typeof percentage === "number" ? percentage : parseFloat(percentage);

    if (
      Number.isNaN(value) ||
      value < MIN_SLIPPAGE_PERCENTAGE ||
      value > MAX_SLIPPAGE_PERCENTAGE
    ) {
      throw new ValidationError(
        `Slippage percentage must be between ${MIN_SLIPPAGE_PERCENTAGE} and ${MAX_SLIPPAGE_PERCENTAGE}`
      );
    }

    return value;
  }
}
