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
import {
  DomainEvent,
  NotificationSettings,
  UserCreatedEvent,
  UserNotificationSettingsChangedEvent,
  UserPreferencesUpdatedEvent,
} from "./events";

export class User {
  private events: DomainEvent[] = [];

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

    const user = new User(
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

    user.addEvent(
      new UserCreatedEvent(
        user.id,
        user.telegramId,
        user.privyUserId,
        user.walletId,
        user.walletAddress,
        user.getPreferences(),
        user.getUsername(),
        user.getReferralCode(),
        user.getReferredBy()
      )
    );

    return user;
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
    if (!updates || Object.keys(updates).length === 0) {
      return;
    }

    const previousPreferences = this.getPreferences();

    const entries = Object.entries(updates).filter(
      ([, value]) => value !== undefined
    ) as [
      keyof UserPreferences,
      UserPreferences[keyof UserPreferences]
    ][];

    if (entries.length === 0) {
      return;
    }

    const changes: Partial<UserPreferences> = {};

    for (const [key, value] of entries) {
      if (previousPreferences[key] !== value) {
        changes[key] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    this.preferences = {
      ...this.preferences,
      ...changes,
    };
    this.updatedAt = new Date();

    const currentPreferences = this.getPreferences();

    this.addEvent(
      new UserPreferencesUpdatedEvent(
        this.id,
        changes,
        previousPreferences,
        currentPreferences
      )
    );

    const notificationKeys: (keyof NotificationSettings)[] = [
      "notificationsEnabled",
      "priceAlertsEnabled",
      "rebalanceAlertsEnabled",
    ];

    const notificationRelatedChanged = notificationKeys.some((key) =>
      Object.prototype.hasOwnProperty.call(changes, key)
    );

    if (notificationRelatedChanged) {
      const previousSettings: NotificationSettings = {
        notificationsEnabled: previousPreferences.notificationsEnabled,
        priceAlertsEnabled: previousPreferences.priceAlertsEnabled,
        rebalanceAlertsEnabled: previousPreferences.rebalanceAlertsEnabled,
      };

      const currentSettings: NotificationSettings = {
        notificationsEnabled: this.preferences.notificationsEnabled,
        priceAlertsEnabled: this.preferences.priceAlertsEnabled,
        rebalanceAlertsEnabled: this.preferences.rebalanceAlertsEnabled,
      };

      const settingsDiffer = notificationKeys.some(
        (key) => previousSettings[key] !== currentSettings[key]
      );

      if (settingsDiffer) {
        this.addEvent(
          new UserNotificationSettingsChangedEvent(
            this.id,
            previousSettings,
            currentSettings
          )
        );
      }
    }
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
    this.updatePreferences({ autoRebalanceEnabled: true });
  }

  disableAutoRebalance(): void {
    this.updatePreferences({ autoRebalanceEnabled: false });
  }

  setRebalanceThreshold(threshold: number): void {
    if (threshold < MIN_REBALANCE_THRESHOLD || threshold > MAX_REBALANCE_THRESHOLD) {
      throw new ValidationError(
        `Rebalance threshold must be between ${MIN_REBALANCE_THRESHOLD} and ${MAX_REBALANCE_THRESHOLD}`
      );
    }

    this.updatePreferences({ rebalanceThreshold: threshold });
  }

  setRebalanceStrategy(strategy: RebalanceStrategy): void {
    this.updatePreferences({ rebalanceStrategy: strategy });
  }

  enableNotifications(): void {
    this.updatePreferences({ notificationsEnabled: true });
  }

  disableNotifications(): void {
    this.updatePreferences({ notificationsEnabled: false });
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

    this.updatePreferences({ rebalanceSchedule: schedule });
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
    this.updatePreferences({ defaultBinRange: binRange });
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
    this.updatePreferences({ stopLossPercentage: percentage });
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
    this.updatePreferences({ takeProfitPercentage: percentage });
  }

  getTakeProfitPercentage(): number | null {
    return this.preferences.takeProfitPercentage;
  }

  setAutoConvertToSol(enabled: boolean): void {
    this.updatePreferences({ autoConvertToSol: enabled });
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
    this.updatePreferences({ slippagePercentage: value });
  }

  getSlippagePercentage(): number {
    return this.preferences.slippagePercentage;
  }

  getEvents(): DomainEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
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
