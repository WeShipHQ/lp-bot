import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { IUserRepository } from "@/domain/user/user.repository";
import { OptimisticLockError } from "@/shared/errors";

export interface UpdateUserParams {
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

const MAX_OPTIMISTIC_RETRIES = 3;

export class UpdateUserUseCase {
  async execute(userId: string, updates: UpdateUserParams): Promise<void> {
    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);

    for (let attempt = 0; attempt < MAX_OPTIMISTIC_RETRIES; attempt++) {
      const currentUser = await userRepository.findById(userId);
      if (!currentUser) {
        throw new Error("User not found");
      }

      if (updates.autoRebalanceEnabled !== undefined) {
        currentUser.updatePreferences({
          autoRebalanceEnabled: updates.autoRebalanceEnabled,
        });
      }

      if (updates.rebalanceThreshold !== undefined) {
        currentUser.updatePreferences({
          rebalanceThreshold: parseFloat(updates.rebalanceThreshold),
        });
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

      try {
        await userRepository.update(currentUser);
        return;
      } catch (error) {
        if (error instanceof OptimisticLockError && attempt < MAX_OPTIMISTIC_RETRIES - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new OptimisticLockError(
      "Failed to update user after multiple attempts"
    );
  }
}
