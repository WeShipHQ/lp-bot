// import {
//   GasPriority,
//   RebalanceSchedule,
//   BinRange,
//   RiskPercentage,
//   SlippageBps,
// } from "@/presentation/constants/settings.constants";
// import { container } from "@/infrastructure/di/container";
// import { GetUserByTelegramIdUseCase } from "../user/get-user-by-telegram-id.use-case";
// import { User } from "@/domain";

// export interface UserSettings {
//   rebalancingSchedule: RebalanceSchedule | string;

//   // New settings
//   autoRebalanceEnabled: boolean;
//   rebalanceThreshold: string;
//   defaultBinRange: number | string;
//   stopLossPercentage: number | string | null;
//   takeProfitPercentage: number | string | null;
//   autoConvertToSol: boolean;
//   slippagePercentage: number | string;
// }

// export class GetUserSettingsUseCase {
//   async execute(user: User): Promise<UserSettings> {
//     // const userGetter = container.get(GetUserByTelegramIdUseCase);
//     // const user = await userGetter.execute(telegramId);

//     if (!user) {
//       throw new Error("User not found");
//     }

//     const autoRebalanceEnabled = user.getPreferences().autoRebalanceEnabled;
//     const rebalanceThreshold =
//       user.getPreferences().rebalanceThreshold || "20.00";
//     const rebalanceSchedule =
//       (user.getRebalanceSchedule() as RebalanceSchedule | string) || "15m";
//     const defaultBinRange = user.getDefaultBinRange()?.toString() || "10";
//     const stopLossPercentage =
//       user.getStopLossPercentage()?.toString() || "25.00";
//     const takeProfitPercentage =
//       user.getTakeProfitPercentage()?.toString() || "25.00";
//     const autoConvertToSol = user.getAutoConvertToSol() ?? true;
//     const slippagePercentage =
//       user.getSlippagePercentage()?.toString() || "3.00";

//     return {
//       // Legacy
//       vaultAddress: null, // Will be implemented later
//       // gasPriority,
//       rebalancingSchedule: rebalanceSchedule,

//       // New settings
//       autoRebalanceEnabled,
//       rebalanceThreshold: rebalanceThreshold.toString(),
//       defaultBinRange,
//       stopLossPercentage,
//       takeProfitPercentage,
//       autoConvertToSol,
//       slippagePercentage,
//     };
//   }
// }
