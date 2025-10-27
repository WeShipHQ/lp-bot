import { randomUUID } from "node:crypto";
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
} from "./constants";
import { UserValidator } from "./user.validator.class";
import { validateUsername } from "./user.validators";

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
    validateUsername(username);

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
    UserValidator.validateRebalanceThreshold(threshold);

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
    UserValidator.validateRebalanceSchedule(schedule);

    this.preferences.rebalanceSchedule = schedule;
    this.updatedAt = new Date();
  }

  getRebalanceSchedule(): RebalanceSchedule {
    return this.preferences.rebalanceSchedule;
  }

  setDefaultBinRange(binRange: number): void {
    UserValidator.validateBinRange(binRange);

    this.preferences.defaultBinRange = binRange;
    this.updatedAt = new Date();
  }

  getDefaultBinRange(): number {
    return this.preferences.defaultBinRange;
  }

  setStopLossPercentage(percentage: number | null): void {
    UserValidator.validateStopLossPercentage(percentage);

    this.preferences.stopLossPercentage = percentage;
    this.updatedAt = new Date();
  }

  getStopLossPercentage(): number | null {
    return this.preferences.stopLossPercentage;
  }

  setTakeProfitPercentage(percentage: number | null): void {
    UserValidator.validateTakeProfitPercentage(percentage);

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
    const value = UserValidator.validateSlippagePercentage(percentage);

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

  setReferredBy(code: string): void {
    if (!code || code.trim().length === 0) {
      throw new ValidationError("Referral code cannot be empty");
    }

    if (this.referredBy) {
      return;
    }

    this.referredBy = code;
    this.updatedAt = new Date();
  }

  getReferredBy(): string | null {
    return this.referredBy;
  }

  hasBeenReferred(): boolean {
    return this.referredBy !== null;
  }
}
