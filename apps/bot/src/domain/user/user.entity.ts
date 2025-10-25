import { ValidationError } from '../shared/errors';

export type RebalanceStrategy = 'STANDARD' | 'DIP_PROTECTION';

export interface UserPreferences {
  // Rebalancing settings
  autoRebalanceEnabled: boolean;
  rebalanceThreshold: number;
  rebalanceStrategy: RebalanceStrategy;
  rebalanceSchedule: string;
  
  // Position configuration
  defaultBinRange: number;
  balancedPositionBinRange: number;
  
  // Risk management
  stopLossPercentage: number | null;
  takeProfitPercentage: number | null;
  
  // Trading settings
  autoConvertToSol: boolean;
  slippagePercentage: string;
  
  // Notification settings
  notificationsEnabled: boolean;
  priceAlertsEnabled: boolean;
  rebalanceAlertsEnabled: boolean;
}

export interface CreateUserData {
  telegramId: string;
  privyUserId: string;
  walletId: string;
  walletAddress: string;
  username?: string;
  preferences?: Partial<UserPreferences>;
}

export class User {
  private constructor(
    public readonly id: string,
    public readonly telegramId: string,
    public readonly privyUserId: string,
    public readonly walletId: string,
    public readonly walletAddress: string,
    private username: string | null,
    private preferences: UserPreferences,
    public readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  static create(data: CreateUserData): User {
    const defaultPreferences: UserPreferences = {
      // Rebalancing settings
      autoRebalanceEnabled: true,
      rebalanceThreshold: 20,
      rebalanceStrategy: 'STANDARD',
      rebalanceSchedule: '15m',
      
      // Position configuration
      defaultBinRange: 10,
      balancedPositionBinRange: 10,
      
      // Risk management
      stopLossPercentage: 25,
      takeProfitPercentage: 25,
      
      // Trading settings
      autoConvertToSol: true,
      slippagePercentage: '3.00',
      
      // Notification settings
      notificationsEnabled: true,
      priceAlertsEnabled: true,
      rebalanceAlertsEnabled: true,
    };

    const preferences = {
      ...defaultPreferences,
      ...data.preferences,
    };

    const now = new Date();

    return new User(
      crypto.randomUUID(),
      data.telegramId,
      data.privyUserId,
      data.walletId,
      data.walletAddress,
      data.username ?? null,
      preferences,
      now,
      now
    );
  }

  static reconstitute(data: {
    id: string;
    telegramId: string;
    privyUserId: string;
    walletId: string;
    walletAddress: string;
    username?: string | null;
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
      data.preferences,
      data.createdAt,
      data.updatedAt
    );
  }

  hasNotificationEnabled(
    type: 'price' | 'rebalance' | 'general' | 'position'
  ): boolean {
    if (!this.preferences.notificationsEnabled) {
      return false;
    }

    switch (type) {
      case 'price':
        return this.preferences.priceAlertsEnabled;
      case 'rebalance':
        return this.preferences.rebalanceAlertsEnabled;
      case 'general':
      case 'position':
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
    if (username && username.trim().length === 0) {
      throw new ValidationError('Username cannot be empty');
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
    if (threshold < 0 || threshold > 100) {
      throw new ValidationError('Rebalance threshold must be between 0 and 100');
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
  setRebalanceSchedule(schedule: string): void {
    this.preferences.rebalanceSchedule = schedule;
    this.updatedAt = new Date();
  }

  getRebalanceSchedule(): string {
    return this.preferences.rebalanceSchedule;
  }

  setDefaultBinRange(binRange: number): void {
    if (binRange < 5 || binRange > 100) {
      throw new ValidationError('Bin range must be between 5 and 100');
    }
    this.preferences.defaultBinRange = binRange;
    this.updatedAt = new Date();
  }

  getDefaultBinRange(): number {
    return this.preferences.defaultBinRange;
  }

  setStopLossPercentage(percentage: number | null): void {
    if (percentage !== null && (percentage < 1 || percentage > 100)) {
      throw new ValidationError('Stop loss percentage must be between 1 and 100');
    }
    this.preferences.stopLossPercentage = percentage;
    this.updatedAt = new Date();
  }

  getStopLossPercentage(): number | null {
    return this.preferences.stopLossPercentage;
  }

  setTakeProfitPercentage(percentage: number | null): void {
    if (percentage !== null && (percentage < 1 || percentage > 100)) {
      throw new ValidationError('Take profit percentage must be between 1 and 100');
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

  setSlippagePercentage(percentage: string): void {
    const value = parseFloat(percentage);
    if (isNaN(value) || value < 0.1 || value > 10) {
      throw new ValidationError('Slippage percentage must be between 0.1 and 10');
    }
    this.preferences.slippagePercentage = percentage;
    this.updatedAt = new Date();
  }

  getSlippagePercentage(): string {
    return this.preferences.slippagePercentage;
  }
}
