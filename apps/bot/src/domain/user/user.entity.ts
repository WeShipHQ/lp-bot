import { ValidationError } from '../shared/errors';

export type RebalanceStrategy = 'STANDARD' | 'DIP_PROTECTION';

export interface UserPreferences {
  autoRebalanceEnabled: boolean;
  rebalanceThreshold: number;
  rebalanceStrategy: RebalanceStrategy;
  balancedPositionBinRange: number;
  notificationsEnabled: boolean;
  priceAlertsEnabled: boolean;
  rebalanceAlertsEnabled: boolean;
}

export interface CreateUserData {
  telegramId: string;
  walletId: string;
  walletAddress: string;
  username?: string;
  preferences?: Partial<UserPreferences>;
}

export class User {
  private constructor(
    public readonly id: string,
    public readonly telegramId: string,
    public readonly walletId: string,
    public readonly walletAddress: string,
    private username: string | null,
    private preferences: UserPreferences,
    public readonly createdAt: Date,
    private updatedAt: Date
  ) {}

  static create(data: CreateUserData): User {
    const defaultPreferences: UserPreferences = {
      autoRebalanceEnabled: true,
      rebalanceThreshold: 5,
      rebalanceStrategy: 'STANDARD',
      balancedPositionBinRange: 10,
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
}
