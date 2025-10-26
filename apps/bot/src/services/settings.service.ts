import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { UpdateUserUseCase } from "@/application/user/update-user.use-case";
import { UserRebalanceScheduleService } from "./user-rebalance-schedule.service";
import { logger } from "@/utils/logger";
import { IUserRepository, UserPreferences } from "@/domain";

// export interface UserSettingsData {
//   autoRebalanceEnabled: boolean;
//   rebalanceSchedule: string;
//   rebalanceThreshold: string;
//   defaultBinRange: number;
//   stopLossPercentage: number | null;
//   takeProfitPercentage: number | null;
//   autoConvertToSol: boolean;
//   slippagePercentage: string;
// }

// export class SettingsService {
//   async getUserSettings(userId: string): Promise<UserPreferences> {
//     const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
//     const user = await userRepository.findById(userId);

//     if (!user) {
//       throw new Error("User not found");
//     }

//     return user.getPreferences()
//   }

//   async updateRebalanceSchedule(
//     userId: string,
//     schedule: string
//   ): Promise<void> {
//     const updater = container.get(UpdateUserUseCase);
//     await updater.setRebalancingSchedule(telegramId, schedule);

//     // Update scheduled jobs
//     const scheduleService = container.get(UserRebalanceScheduleService);
//     await scheduleService.updateUserRebalanceSchedule(telegramId);

//     logger.info(
//       `Updated rebalance schedule to ${schedule} for user ${telegramId}`
//     );
//   }

//   async updateAutoRebalance(
//     telegramId: string,
//     enabled: boolean
//   ): Promise<void> {
//     const updater = container.get(UpdateUserUseCase);
//     await updater.toggleAutoRebalance(telegramId);

//     // Update scheduled jobs
//     const scheduleService = container.get(UserRebalanceScheduleService);
//     if (enabled) {
//       await scheduleService.updateUserRebalanceSchedule(telegramId);
//     } else {
//       await scheduleService.removeUserRebalanceJobs(telegramId);
//     }

//     logger.info(`Updated auto rebalance to ${enabled} for user ${telegramId}`);
//   }

//   async shouldAutoRebalance(
//     position: any,
//     userSettings: UserSettingsData
//   ): Promise<boolean> {
//     // Check if auto rebalance is enabled
//     if (!userSettings.autoRebalanceEnabled) {
//       return false;
//     }

//     // Check if rebalance schedule is not disabled
//     if (userSettings.rebalanceSchedule === "disabled") {
//       return false;
//     }

//     // Add more logic here based on position health, thresholds, etc.
//     // This would integrate with position monitoring logic
//     return true; // Placeholder - implement actual logic
//   }

//   async getSlippageForUser(telegramId: string): Promise<number> {
//     const settings = await this.getUserSettings(telegramId);
//     return parseFloat(settings.slippagePercentage);
//   }

//   async shouldStopLoss(
//     position: any,
//     userSettings: UserSettingsData
//   ): Promise<boolean> {
//     if (!userSettings.stopLossPercentage) {
//       return false;
//     }

//     // Add logic to check if position has hit stop loss threshold
//     // This would integrate with position monitoring logic
//     return false; // Placeholder - implement actual logic
//   }

//   async shouldTakeProfit(
//     position: any,
//     userSettings: UserSettingsData
//   ): Promise<boolean> {
//     if (!userSettings.takeProfitPercentage) {
//       return false;
//     }

//     // Add logic to check if position has hit take profit threshold
//     // This would integrate with position monitoring logic
//     return false; // Placeholder - implement actual logic
//   }

//   async shouldAutoConvertToSol(telegramId: string): Promise<boolean> {
//     const settings = await this.getUserSettings(telegramId);
//     return settings.autoConvertToSol;
//   }

//   async getDefaultBinRange(telegramId: string): Promise<number> {
//     const settings = await this.getUserSettings(telegramId);
//     return settings.defaultBinRange;
//   }

//   async getRebalanceThreshold(telegramId: string): Promise<number> {
//     const settings = await this.getUserSettings(telegramId);
//     return parseFloat(settings.rebalanceThreshold);
//   }
// }
