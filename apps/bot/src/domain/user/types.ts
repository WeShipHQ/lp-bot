/**
 * User Domain Types
 * 
 * This file contains all user-related type definitions, interfaces, and type aliases
 * used throughout the user domain.
 */

/**
 * Rebalancing strategy for position management
 */
export type RebalanceStrategy = "STANDARD" | "DIP_PROTECTION";

/**
 * Type of notification
 */
export type NotificationType = "price" | "rebalance" | "general" | "position";

/**
 * Rebalancing schedule options
 */
export type RebalanceSchedule = "5m" | "15m" | "1h" | "3h" | "disabled" | string;

/**
 * Type-safe user ID
 */
export type UserId = string;

/**
 * Type-safe Telegram ID
 */
export type TelegramId = string;

/**
 * Type-safe Solana wallet address
 */
export type WalletAddress = string;

/**
 * Type-safe wallet ID (Privy)
 */
export type WalletId = string;

/**
 * Type-safe Privy user ID
 */
export type PrivyUserId = string;

/**
 * User preferences configuration
 */
export interface UserPreferences {
  // Rebalancing settings
  autoRebalanceEnabled: boolean;
  rebalanceThreshold: number;
  rebalanceStrategy: RebalanceStrategy;
  rebalanceSchedule: RebalanceSchedule;

  // Position configuration
  defaultBinRange: number;
  balancedPositionBinRange: number;

  // Risk management
  stopLossPercentage: number | null;
  takeProfitPercentage: number | null;

  // Trading settings
  autoConvertToSol: boolean;
  slippagePercentage: number;

  // Notification settings
  notificationsEnabled: boolean;
  priceAlertsEnabled: boolean;
  rebalanceAlertsEnabled: boolean;
}

/**
 * Data required to create a new user
 */
export interface CreateUserData {
  telegramId: TelegramId;
  privyUserId: PrivyUserId;
  walletId: WalletId;
  walletAddress: WalletAddress;
  username?: string;
  referralCode?: string;
  referredBy?: string;
  preferences?: Partial<UserPreferences>;
}

/**
 * User data for reconstituting an existing user entity
 */
export interface UserData {
  id: UserId;
  telegramId: TelegramId;
  privyUserId: PrivyUserId;
  walletId: WalletId;
  walletAddress: WalletAddress;
  username?: string | null;
  referralCode?: string | null;
  referredBy?: string | null;
  preferences: UserPreferences;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
