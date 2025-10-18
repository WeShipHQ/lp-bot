export interface UserProfile {
  id: string;
  telegramId: string;
  walletId: string;
  walletAddress: string;
  username?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSettings {
  autoRebalanceEnabled: boolean;
  rebalanceThreshold: number;
  rebalanceStrategy: 'STANDARD' | 'DIP_PROTECTION';
  balancedPositionBinRange: number;
  notificationsEnabled: boolean;
  priceAlertsEnabled: boolean;
  rebalanceAlertsEnabled: boolean;
}
