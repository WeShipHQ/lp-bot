/**
 * User Domain Constants
 *
 * All default values and limits related to user preferences, validation, and
 * configuration are defined here to ensure consistency across the codebase.
 */

// Default preferences
export const DEFAULT_AUTO_REBALANCE_ENABLED = true;
export const DEFAULT_REBALANCE_THRESHOLD = 20;
export const DEFAULT_REBALANCE_STRATEGY = "STANDARD" as const;
export const DEFAULT_REBALANCE_SCHEDULE = "15m";
export const DEFAULT_BIN_RANGE = 10;
export const DEFAULT_BALANCED_POSITION_BIN_RANGE = 10;
export const DEFAULT_STOP_LOSS_PERCENTAGE = 25;
export const DEFAULT_TAKE_PROFIT_PERCENTAGE = 25;
export const DEFAULT_AUTO_CONVERT_TO_SOL = true;
export const DEFAULT_SLIPPAGE_PERCENTAGE = 3.0;
export const DEFAULT_NOTIFICATIONS_ENABLED = true;
export const DEFAULT_PRICE_ALERTS_ENABLED = true;
export const DEFAULT_REBALANCE_ALERTS_ENABLED = true;

// Validation limits
export const MIN_TELEGRAM_ID = 1;
export const MAX_TELEGRAM_ID = 9999999999;
export const MIN_REBALANCE_THRESHOLD = 0;
export const MAX_REBALANCE_THRESHOLD = 100;
export const MIN_BIN_RANGE = 5;
export const MAX_BIN_RANGE = 100;
export const MIN_STOP_LOSS_PERCENTAGE = 1;
export const MAX_STOP_LOSS_PERCENTAGE = 100;
export const MIN_TAKE_PROFIT_PERCENTAGE = 1;
export const MAX_TAKE_PROFIT_PERCENTAGE = 100;
export const MIN_SLIPPAGE_PERCENTAGE = 0.1;
export const MAX_SLIPPAGE_PERCENTAGE = 10;
export const MAX_USERNAME_LENGTH = 32;
