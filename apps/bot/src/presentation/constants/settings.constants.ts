import { RebalanceSchedule } from "@/domain/user/types";

export const ST_PREFIX = "st" as const;

// Presentation layer specific types for UI options
export type BinRange = 5 | 10 | 20 | "custom";
export type RiskPercentage = 10 | 25 | 50 | "custom" | "disabled";
export type SlippageBps = 50 | 100 | 300 | 500 | "custom"; // 0.5%, 1%, 3%, 5%

export const ST_CALLBACKS = {
  refresh: `${ST_PREFIX}:refresh`,
  scheduleSet: (value: RebalanceSchedule | "custom") =>
    `${ST_PREFIX}:schedule:set:${value}`,

  // Rebalancing settings
  toggleRebalance: `${ST_PREFIX}:rebalance:toggle`,
  rebalanceThreshold: (value: string) => `${ST_PREFIX}:threshold:set:${value}`,

  // Position configuration
  binRange: (value: BinRange) => `${ST_PREFIX}:bin:set:${value}`,

  // Risk management
  stopLoss: (value: RiskPercentage) => `${ST_PREFIX}:sl:set:${value}`,
  takeProfit: (value: RiskPercentage) => `${ST_PREFIX}:tp:set:${value}`,

  // Trading settings
  toggleAutoConvert: `${ST_PREFIX}:convert:toggle`,
  slippage: (value: SlippageBps) => `${ST_PREFIX}:slippage:set:${value}`,
} as const;

export const ST_PATTERNS = {
  refresh: new RegExp(`^${ST_PREFIX}:refresh$`),
  scheduleSet: new RegExp(
    `^${ST_PREFIX}:schedule:set:(5m|15m|1h|3h|disabled|custom)$`
  ),

  // Rebalancing settings
  toggleRebalance: new RegExp(`^${ST_PREFIX}:rebalance:toggle$`),
  rebalanceThreshold: new RegExp(
    `^${ST_PREFIX}:threshold:set:(10|15|20|25|30|custom)$`
  ),

  // Position configuration
  binRange: new RegExp(`^${ST_PREFIX}:bin:set:(5|10|20|custom)$`),

  // Risk management
  stopLoss: new RegExp(`^${ST_PREFIX}:sl:set:(10|25|50|custom|disabled)$`),
  takeProfit: new RegExp(`^${ST_PREFIX}:tp:set:(10|25|50|custom|disabled)$`),

  // Trading settings
  toggleAutoConvert: new RegExp(`^${ST_PREFIX}:convert:toggle$`),
  slippage: new RegExp(`^${ST_PREFIX}:slippage:set:(50|100|300|500|custom)$`),
} as const;
