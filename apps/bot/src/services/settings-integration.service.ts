import { container } from "@/infrastructure/di/container";
import { SettingsService } from "@/services/settings.service";
import { logger } from "@/utils/logger";

/**
 * Integration service that connects user settings with various bot functionalities
 * This service ensures that user preferences are respected across all operations
 */
export class SettingsIntegrationService {
  private settingsService: SettingsService;

  constructor() {
    this.settingsService = container.get(SettingsService);
  }

  /**
   * Get all user settings for position creation
   */
  async getPositionCreationSettings(telegramId: string) {
    return await this.settingsService.getUserSettings(telegramId);
  }

  /**
   * Check if position should be auto-rebalanced based on user settings
   */
  async shouldAutoRebalancePosition(telegramId: string, position: any): Promise<boolean> {
    const userSettings = await this.settingsService.getUserSettings(telegramId);
    return await this.settingsService.shouldAutoRebalance(position, userSettings);
  }

  /**
   * Check if position should hit stop loss based on user settings
   */
  async shouldStopLossPosition(telegramId: string, position: any): Promise<boolean> {
    const userSettings = await this.settingsService.getUserSettings(telegramId);
    return await this.settingsService.shouldStopLoss(position, userSettings);
  }

  /**
   * Check if position should take profit based on user settings
   */
  async shouldTakeProfitPosition(telegramId: string, position: any): Promise<boolean> {
    const userSettings = await this.settingsService.getUserSettings(telegramId);
    return await this.settingsService.shouldTakeProfit(position, userSettings);
  }

  /**
   * Get slippage tolerance for user
   */
  async getSlippageTolerance(telegramId: string): Promise<number> {
    return await this.settingsService.getSlippageForUser(telegramId);
  }

  /**
   * Check if fees should be auto-converted to SOL
   */
  async shouldAutoConvertFeesToSol(telegramId: string): Promise<boolean> {
    return await this.settingsService.shouldAutoConvertToSol(telegramId);
  }

  /**
   * Get default bin range for new positions
   */
  async getDefaultBinRange(telegramId: string): Promise<number> {
    return await this.settingsService.getDefaultBinRange(telegramId);
  }

  /**
   * Get rebalance threshold for position monitoring
   */
  async getRebalanceThreshold(telegramId: string): Promise<number> {
    return await this.settingsService.getRebalanceThreshold(telegramId);
  }

  /**
   * Update user's rebalance schedule and restart scheduled jobs
   */
  async updateUserRebalanceSchedule(telegramId: string, schedule: string): Promise<void> {
    await this.settingsService.updateRebalanceSchedule(telegramId, schedule);
    logger.info(`Updated rebalance schedule to ${schedule} for user ${telegramId}`);
  }

  /**
   * Toggle auto rebalance and update scheduled jobs
   */
  async toggleAutoRebalance(telegramId: string, enabled: boolean): Promise<void> {
    await this.settingsService.updateAutoRebalance(telegramId, enabled);
    logger.info(`Toggled auto rebalance to ${enabled} for user ${telegramId}`);
  }

  /**
   * Update user's stop loss setting
   */
  async updateStopLossPercentage(telegramId: string, percentage: number | null): Promise<void> {
    const updater = container.get(UpdateUserSettingUseCase);
    await updater.setStopLossPercentage(telegramId, percentage);
    logger.info(`Updated stop loss to ${percentage}% for user ${telegramId}`);
  }

  /**
   * Update user's take profit setting
   */
  async updateTakeProfitPercentage(telegramId: string, percentage: number | null): Promise<void> {
    const updater = container.get(UpdateUserSettingUseCase);
    await updater.setTakeProfitPercentage(telegramId, percentage);
    logger.info(`Updated take profit to ${percentage}% for user ${telegramId}`);
  }

  /**
   * Update user's slippage setting
   */
  async updateSlippagePercentage(telegramId: string, percentage: number): Promise<void> {
    const updater = container.get(UpdateUserSettingUseCase);
    await updater.setSlippagePercentage(telegramId, percentage.toString());
    logger.info(`Updated slippage to ${percentage}% for user ${telegramId}`);
  }

  /**
   * Update user's default bin range
   */
  async updateDefaultBinRange(telegramId: string, binRange: number): Promise<void> {
    const updater = container.get(UpdateUserSettingUseCase);
    await updater.setDefaultBinRange(telegramId, binRange);
    logger.info(`Updated default bin range to ${binRange} for user ${telegramId}`);
  }

  /**
   * Update user's auto convert to SOL setting
   */
  async updateAutoConvertToSol(telegramId: string, enabled: boolean): Promise<void> {
    const updater = container.get(UpdateUserSettingUseCase);
    await updater.toggleAutoConvertToSol(telegramId);
    logger.info(`Updated auto convert to SOL to ${enabled} for user ${telegramId}`);
  }
}

export const settingsIntegrationService = new SettingsIntegrationService();