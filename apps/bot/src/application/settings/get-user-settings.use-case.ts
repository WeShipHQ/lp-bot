import { GasPriority, RebalanceSchedule, BinRange, RiskPercentage, SlippageBps } from "@/presentation/constants/settings.constants";
import { container } from "@/infrastructure/di/container";
import { GetUserByTelegramIdUseCase } from "../user/get-user-by-telegram-id.use-case";

export interface UserSettings {
  // Legacy settings
  vaultAddress?: string | null;
  gasPriority: GasPriority;
  rebalancingSchedule: RebalanceSchedule | string;
  
  // New settings
  autoRebalanceEnabled: boolean;
  rebalanceThreshold: string;
  defaultBinRange: number | string;
  stopLossPercentage: number | string | null;
  takeProfitPercentage: number | string | null;
  autoConvertToSol: boolean;
  slippagePercentage: number | string;
}

export class GetUserSettingsUseCase {
  async execute(telegramId: string): Promise<UserSettings> {
    const userGetter = container.get(GetUserByTelegramIdUseCase);
    const user = await userGetter.execute(telegramId);
    
    if (!user) {
      throw new Error("User not found");
    }

    // Legacy settings (for backwards compatibility)
    const gasPriority = (user.gasPriority as GasPriority) || "medium";
    
    // New settings with defaults
    const autoRebalanceEnabled = user.autoRebalanceEnabled ?? true;
    const rebalanceThreshold = user.rebalanceThreshold?.toString() || "20.00";
    const rebalanceSchedule = (user.rebalanceSchedule as RebalanceSchedule | string) || "15m";
    const defaultBinRange = user.defaultBinRange ?? 10;
    const stopLossPercentage = user.stopLossPercentage?.toString() || "25.00";
    const takeProfitPercentage = user.takeProfitPercentage?.toString() || "25.00";
    const autoConvertToSol = user.autoConvertToSol ?? true;
    const slippagePercentage = user.slippagePercentage?.toString() || "3.00";

    return {
      // Legacy
      vaultAddress: null, // Will be implemented later
      gasPriority,
      rebalancingSchedule,
      
      // New settings
      autoRebalanceEnabled,
      rebalanceThreshold,
      defaultBinRange,
      stopLossPercentage,
      takeProfitPercentage,
      autoConvertToSol,
      slippagePercentage,
    };
  }
}