import { container } from "@/infrastructure/di/container";
import { IUserRepository } from "@/domain/user/user.repository";
import { User } from "@/domain/user/user.entity";

export interface UpdateUserParams {
  gasPriority?: string;
  autoRebalanceEnabled?: boolean;
  rebalanceThreshold?: string;
  rebalanceStrategy?: string;
  rebalanceSchedule?: string;
  defaultBinRange?: number;
  balancedPositionBinRange?: number;
  stopLossPercentage?: number | null;
  takeProfitPercentage?: number | null;
  autoConvertToSol?: boolean;
  slippagePercentage?: string;
}

export class UpdateUserUseCase {
  async execute(telegramId: string, updates: UpdateUserParams): Promise<void> {
    const userRepository = container.get(IUserRepository);
    
    // Get current user by telegramId
    const currentUser = await userRepository.findByTelegramId(telegramId);
    if (!currentUser) {
      throw new Error("User not found");
    }
    
    // Update user preferences with new values
    if (updates.gasPriority !== undefined) {
      // Note: gasPriority is not in UserPreferences yet, would need to add it
      // For now, we'll skip this or use metadata
    }
    
    if (updates.autoRebalanceEnabled !== undefined) {
      currentUser.updatePreferences({ autoRebalanceEnabled: updates.autoRebalanceEnabled });
    }
    
    if (updates.rebalanceThreshold !== undefined) {
      currentUser.updatePreferences({ rebalanceThreshold: parseFloat(updates.rebalanceThreshold) });
    }
    
    if (updates.rebalanceSchedule !== undefined) {
      currentUser.setRebalanceSchedule(updates.rebalanceSchedule);
    }
    
    if (updates.defaultBinRange !== undefined) {
      currentUser.setDefaultBinRange(updates.defaultBinRange);
    }
    
    if (updates.stopLossPercentage !== undefined) {
      currentUser.setStopLossPercentage(updates.stopLossPercentage);
    }
    
    if (updates.takeProfitPercentage !== undefined) {
      currentUser.setTakeProfitPercentage(updates.takeProfitPercentage);
    }
    
    if (updates.autoConvertToSol !== undefined) {
      currentUser.setAutoConvertToSol(updates.autoConvertToSol);
    }
    
    if (updates.slippagePercentage !== undefined) {
      currentUser.setSlippagePercentage(updates.slippagePercentage);
    }
    
    // Save updated user to repository
    await userRepository.update(currentUser);
  }
}