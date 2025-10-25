import { GasPriority, RebalanceSchedule, BinRange, RiskPercentage, SlippageBps } from "@/presentation/constants/settings.constants";
import { container } from "@/infrastructure/di/container";
import { GetUserByTelegramIdUseCase } from "../user/get-user-by-telegram-id.use-case";
import { UpdateUserUseCase } from "../user/update-user.use-case";
import { solanaService } from "@/services/solana.service";

export class UpdateUserSettingUseCase {
  private async getUser(telegramId: string) {
    const userGetter = container.get(GetUserByTelegramIdUseCase);
    const user = await userGetter.execute(telegramId);
    if (!user) throw new Error("User not found");
    return user;
  }

  // Legacy methods
  async setVaultAddress(telegramId: string, address: string): Promise<void> {
    if (!solanaService.validateAddress(address)) {
      throw new Error("Invalid Solana address");
    }
    // This would be stored in user metadata or a separate table
    // For now, we'll skip this as it's not in our schema
  }

  async setGasPriority(telegramId: string, level: GasPriority): Promise<void> {
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { gasPriority: level });
  }

  async setRebalancingSchedule(telegramId: string, schedule: RebalanceSchedule | string): Promise<void> {
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { rebalanceSchedule: schedule });
  }

  // New settings methods
  async toggleAutoRebalance(telegramId: string): Promise<boolean> {
    const user = await this.getUser(telegramId);
    const newState = !user.autoRebalanceEnabled;
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { autoRebalanceEnabled: newState });
    
    return newState;
  }

  async setRebalanceThreshold(telegramId: string, threshold: string): Promise<void> {
    const value = parseFloat(threshold);
    if (isNaN(value) || value < 10 || value > 30) {
      throw new Error("Rebalance threshold must be between 10% and 30%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { rebalanceThreshold: value.toString() });
  }

  async setDefaultBinRange(telegramId: string, binRange: BinRange | number): Promise<void> {
    let value: number;
    
    if (typeof binRange === 'string' && binRange === 'custom') {
      // Handle custom input in the handler
      return;
    } else if (typeof binRange === 'number') {
      value = binRange;
    } else {
      value = binRange as number;
    }
    
    if (value < 5 || value > 100) {
      throw new Error("Bin range must be between 5 and 100");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { defaultBinRange: value });
  }

  async setStopLossPercentage(telegramId: string, percentage: RiskPercentage | number | string): Promise<void> {
    let value: number | null;
    
    if (typeof percentage === 'string' && (percentage === 'disabled' || percentage === '0')) {
      value = null;
    } else if (typeof percentage === 'string' && percentage === 'custom') {
      // Handle custom input in the handler
      return;
    } else if (typeof percentage === 'number') {
      value = percentage;
    } else {
      value = percentage as number;
    }
    
    if (value !== null && (value < 1 || value > 100)) {
      throw new Error("Stop loss percentage must be between 1% and 100%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { stopLossPercentage: value });
  }

  async setTakeProfitPercentage(telegramId: string, percentage: RiskPercentage | number | string): Promise<void> {
    let value: number | null;
    
    if (typeof percentage === 'string' && (percentage === 'disabled' || percentage === '0')) {
      value = null;
    } else if (typeof percentage === 'string' && percentage === 'custom') {
      // Handle custom input in the handler
      return;
    } else if (typeof percentage === 'number') {
      value = percentage;
    } else {
      value = percentage as number;
    }
    
    if (value !== null && (value < 1 || value > 100)) {
      throw new Error("Take profit percentage must be between 1% and 100%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { takeProfitPercentage: value });
  }

  async toggleAutoConvertToSol(telegramId: string): Promise<boolean> {
    const user = await this.getUser(telegramId);
    const newState = !user.autoConvertToSol;
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { autoConvertToSol: newState });
    
    return newState;
  }

  async setSlippagePercentage(telegramId: string, slippage: SlippageBps | number): Promise<void> {
    let value: number;
    
    if (typeof slippage === 'string' && slippage === 'custom') {
      // Handle custom input in the handler
      return;
    } else if (typeof slippage === 'number') {
      value = slippage;
    } else {
      value = slippage as number;
    }
    
    // Convert basis points to percentage
    const percentage = value / 100;
    
    if (percentage < 0.1 || percentage > 10) {
      throw new Error("Slippage must be between 0.1% and 10%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { slippagePercentage: percentage.toString() });
  }

  // Custom input handlers
  async setCustomBinRange(telegramId: string, customValue: string): Promise<void> {
    const value = parseInt(customValue);
    if (isNaN(value) || value < 5 || value > 100) {
      throw new Error("Custom bin range must be between 5 and 100");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { defaultBinRange: value });
  }

  async setCustomRebalanceThreshold(telegramId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (isNaN(value) || value < 10 || value > 30) {
      throw new Error("Custom rebalance threshold must be between 10% and 30%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { rebalanceThreshold: value.toString() });
  }

  async setCustomStopLoss(telegramId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (customValue === '0' || isNaN(value)) {
      // Disable stop loss
      const updater = container.get(UpdateUserUseCase);
      await updater.execute(telegramId, { stopLossPercentage: null });
      return;
    }
    
    if (value < 1 || value > 100) {
      throw new Error("Custom stop loss must be between 1% and 100%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { stopLossPercentage: value });
  }

  async setCustomTakeProfit(telegramId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (customValue === '0' || isNaN(value)) {
      // Disable take profit
      const updater = container.get(UpdateUserUseCase);
      await updater.execute(telegramId, { takeProfitPercentage: null });
      return;
    }
    
    if (value < 1 || value > 100) {
      throw new Error("Custom take profit must be between 1% and 100%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { takeProfitPercentage: value });
  }

  async setCustomSlippage(telegramId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (isNaN(value) || value < 0.1 || value > 10) {
      throw new Error("Custom slippage must be between 0.1% and 10%");
    }
    
    const updater = container.get(UpdateUserUseCase);
    await updater.execute(telegramId, { slippagePercentage: value.toString() });
  }
}