import { randomUUID } from "node:crypto";
import { ValidationError } from "../shared/errors";
import type {
  RebalanceStrategy,
  UserPreferences,
  CreateUserData,
  NotificationType,
  UserId,
  TelegramId,
  PrivyUserId,
  WalletId,
  WalletAddress,
  RebalanceSchedule,
} from "./types";
import {
  DEFAULT_AUTO_REBALANCE_ENABLED,
  DEFAULT_REBALANCE_THRESHOLD,
  DEFAULT_REBALANCE_STRATEGY,
  DEFAULT_REBALANCE_SCHEDULE,
  DEFAULT_BIN_RANGE,
  DEFAULT_BALANCED_POSITION_BIN_RANGE,
  DEFAULT_STOP_LOSS_PERCENTAGE,
  DEFAULT_TAKE_PROFIT_PERCENTAGE,
  DEFAULT_AUTO_CONVERT_TO_SOL,
  DEFAULT_SLIPPAGE_PERCENTAGE,
  DEFAULT_NOTIFICATIONS_ENABLED,
  DEFAULT_PRICE_ALERTS_ENABLED,
  DEFAULT_REBALANCE_ALERTS_ENABLED,
  MIN_REBALANCE_THRESHOLD,
  MAX_REBALANCE_THRESHOLD,
  MIN_BIN_RANGE,
  MAX_BIN_RANGE,
  MIN_STOP_LOSS_PERCENTAGE,
  MAX_STOP_LOSS_PERCENTAGE,
  MIN_TAKE_PROFIT_PERCENTAGE,
  MAX_TAKE_PROFIT_PERCENTAGE,
  MIN_SLIPPAGE_PERCENTAGE,
  MAX_SLIPPAGE_PERCENTAGE,
  MAX_USERNAME_LENGTH,
} from "./constants";

export class User {
  private constructor(
    public readonly id: UserId,
    public readonly telegramId: TelegramId,
    public readonly privyUserId: PrivyUserId,
    public readonly walletId: WalletId,
    public readonly walletAddress: WalletAddress,
    private username: string | null,
    private referralCode: string | null,
    private referredBy: string | null,
    private preferences: UserPreferences,
    public readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  static create(data: CreateUserData): User {
    const defaultPreferences: UserPreferences = {
      // Rebalancing settings
      autoRebalanceEnabled: DEFAULT_AUTO_REBALANCE_ENABLED,
      rebalanceThreshold: DEFAULT_REBALANCE_THRESHOLD,
      rebalanceStrategy: DEFAULT_REBALANCE_STRATEGY,
      rebalanceSchedule: DEFAULT_REBALANCE_SCHEDULE,

      // Position configuration
      defaultBinRange: DEFAULT_BIN_RANGE,
      balancedPositionBinRange: DEFAULT_BALANCED_POSITION_BIN_RANGE,

      // Risk management
      stopLossPercentage: DEFAULT_STOP_LOSS_PERCENTAGE,
      takeProfitPercentage: DEFAULT_TAKE_PROFIT_PERCENTAGE,

      // Trading settings
      autoConvertToSol: DEFAULT_AUTO_CONVERT_TO_SOL,
      slippagePercentage: DEFAULT_SLIPPAGE_PERCENTAGE,

      // Notification settings
      notificationsEnabled: DEFAULT_NOTIFICATIONS_ENABLED,
      priceAlertsEnabled: DEFAULT_PRICE_ALERTS_ENABLED,
      rebalanceAlertsEnabled: DEFAULT_REBALANCE_ALERTS_ENABLED,
    };

    const preferences: UserPreferences = {
      ...defaultPreferences,
      ...data.preferences,
    };

    const now = new Date();

    return new User(
      randomUUID() as UserId,
      data.telegramId,
      data.privyUserId,
      data.walletId,
      data.walletAddress,
      data.username ?? null,
      data.referralCode ?? null,
      data.referredBy ?? null,
      preferences,
      now,
      now
    );
  }

  static reconstitute(data: {
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
  }): User {
    return new User(
      data.id,
      data.telegramId,
      data.privyUserId,
      data.walletId,
      data.walletAddress,
      data.username ?? null,
      data.referralCode ?? null,
      data.referredBy ?? null,
      data.preferences,
      data.createdAt,
      data.updatedAt
    );
  }

  hasNotificationEnabled(type: NotificationType): boolean {
    if (!this.preferences.notificationsEnabled) {
      return false;
    }

    switch (type) {
      case "price":
        return this.preferences.priceAlertsEnabled;
      case "rebalance":
        return this.preferences.rebalanceAlertsEnabled;
      case "general":
      case "position":
        return true;
      default:
        return false;
    }
  }

  updatePreferences(updates: Partial<UserPreferences>): void {
    this.preferences = {
      ...this.preferences,
      ...updates,
    };
    this.updatedAt = new Date();
  }

  updateUsername(username: string): void {
    if (!username || username.trim().length === 0) {
      throw new ValidationError("Username cannot be empty");
    }

    if (username.length > MAX_USERNAME_LENGTH) {
      throw new ValidationError(
        `Username cannot exceed ${MAX_USERNAME_LENGTH} characters`
      );
    }

    this.username = username;
    this.updatedAt = new Date();
  }

  enableAutoRebalance(): void {
    this.preferences.autoRebalanceEnabled = true;
    this.updatedAt = new Date();
  }

  disableAutoRebalance(): void {
    this.preferences.autoRebalanceEnabled = false;
    this.updatedAt = new Date();
  }

  setRebalanceThreshold(threshold: number): void {
    if (threshold < MIN_REBALANCE_THRESHOLD || threshold > MAX_REBALANCE_THRESHOLD) {
      throw new ValidationError(
        `Rebalance threshold must be between ${MIN_REBALANCE_THRESHOLD} and ${MAX_REBALANCE_THRESHOLD}`
      );
    }

    this.preferences.rebalanceThreshold = threshold;
    this.updatedAt = new Date();
  }

  setRebalanceStrategy(strategy: RebalanceStrategy): void {
    this.preferences.rebalanceStrategy = strategy;
    this.updatedAt = new Date();
  }

  enableNotifications(): void {
    this.preferences.notificationsEnabled = true;
    this.updatedAt = new Date();
  }

  disableNotifications(): void {
    this.preferences.notificationsEnabled = false;
    this.updatedAt = new Date();
  }

  getPreferences(): UserPreferences {
    return { ...this.preferences };
  }

  getUsername(): string | null {
    return this.username;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  isAutoRebalanceEnabled(): boolean {
    return this.preferences.autoRebalanceEnabled;
  }

  areNotificationsEnabled(): boolean {
    return this.preferences.notificationsEnabled;
  }

  // New settings methods
  setRebalanceSchedule(schedule: RebalanceSchedule): void {
    if (!schedule || String(schedule).trim().length === 0) {
      throw new ValidationError("Rebalance schedule cannot be empty");
    }

    this.preferences.rebalanceSchedule = schedule;
    this.updatedAt = new Date();
  }

  getRebalanceSchedule(): RebalanceSchedule {
    return this.preferences.rebalanceSchedule;
  }

  setDefaultBinRange(binRange: number): void {
    if (binRange < MIN_BIN_RANGE || binRange > MAX_BIN_RANGE) {
      throw new ValidationError(
        `Bin range must be between ${MIN_BIN_RANGE} and ${MAX_BIN_RANGE}`
      );
    }
    this.preferences.defaultBinRange = binRange;
    this.updatedAt = new Date();
  }

  getDefaultBinRange(): number {
    return this.preferences.defaultBinRange;
  }

  setStopLossPercentage(percentage: number | null): void {
    if (percentage !== null && (percentage < MIN_STOP_LOSS_PERCENTAGE || percentage > MAX_STOP_LOSS_PERCENTAGE)) {
      throw new ValidationError(
        `Stop loss percentage must be between ${MIN_STOP_LOSS_PERCENTAGE} and ${MAX_STOP_LOSS_PERCENTAGE}`
      );
    }
    this.preferences.stopLossPercentage = percentage;
    this.updatedAt = new Date();
  }

  getStopLossPercentage(): number | null {
    return this.preferences.stopLossPercentage;
  }

  setTakeProfitPercentage(percentage: number | null): void {
    if (percentage !== null && (percentage < MIN_TAKE_PROFIT_PERCENTAGE || percentage > MAX_TAKE_PROFIT_PERCENTAGE)) {
      throw new ValidationError(
        `Take profit percentage must be between ${MIN_TAKE_PROFIT_PERCENTAGE} and ${MAX_TAKE_PROFIT_PERCENTAGE}`
      );
    }
    this.preferences.takeProfitPercentage = percentage;
    this.updatedAt = new Date();
  }

  getTakeProfitPercentage(): number | null {
    return this.preferences.takeProfitPercentage;
  }

  setAutoConvertToSol(enabled: boolean): void {
    this.preferences.autoConvertToSol = enabled;
    this.updatedAt = new Date();
  }

  getAutoConvertToSol(): boolean {
    return this.preferences.autoConvertToSol;
  }

  setSlippagePercentage(percentage: string | number): void {
    const value =
      typeof percentage === "number" ? percentage : parseFloat(percentage);
    if (isNaN(value) || value < MIN_SLIPPAGE_PERCENTAGE || value > MAX_SLIPPAGE_PERCENTAGE) {
      throw new ValidationError(
        `Slippage percentage must be between ${MIN_SLIPPAGE_PERCENTAGE} and ${MAX_SLIPPAGE_PERCENTAGE}`
      );
    }
    this.preferences.slippagePercentage = value;
    this.updatedAt = new Date();
  }

  getSlippagePercentage(): number {
    return this.preferences.slippagePercentage;
  }

  // Referral-related methods
  getReferralCode(): string | null {
    return this.referralCode;
  }

  setReferralCode(code: string): void {
    this.referralCode = code;
    this.updatedAt = new Date();
  }

  getReferredBy(): string | null {
    return this.referredBy;
  }

  hasBeenReferred(): boolean {
    return this.referredBy !== null;
  }
}
