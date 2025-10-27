import {
  BinRange,
  RiskPercentage,
  SlippageBps,
} from "@/presentation/constants/settings.constants";
import { RebalanceSchedule } from "@/domain/user/types";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { IUserRepository } from "@/domain";

export class UpdateUserSettingUseCase {
  async setRebalanceSchedule(
    userId: string,
    schedule: RebalanceSchedule | string
  ): Promise<void> {
    if (schedule === "custom") {
      // Handle custom input in the handler
      return;
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setRebalanceSchedule(schedule as RebalanceSchedule);
    await userRepository.update(user);
  }

  async toggleAutoRebalance(userId: string): Promise<void> {
    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.isAutoRebalanceEnabled()) {
      user.disableAutoRebalance();
    } else {
      user.enableAutoRebalance();
    }

    await userRepository.update(user);
  }

  async setRebalanceThreshold(
    userId: string,
    threshold: string
  ): Promise<void> {
    const value = parseFloat(threshold);
    if (isNaN(value) || value < 10 || value > 30) {
      throw new Error("Rebalance threshold must be between 10% and 30%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setRebalanceThreshold(value);
    await userRepository.update(user);
  }

  async setDefaultBinRange(
    userId: string,
    binRange: BinRange | number
  ): Promise<void> {
    let value: number;

    if (typeof binRange === "string" && binRange === "custom") {
      // Handle custom input in the handler
      return;
    } else if (typeof binRange === "number") {
      value = binRange;
    } else {
      value = binRange as number;
    }

    if (value < 5 || value > 100) {
      throw new Error("Bin range must be between 5 and 100");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setDefaultBinRange(value);
    await userRepository.update(user);
  }

  async setStopLossPercentage(
    userId: string,
    percentage: RiskPercentage | number | string
  ): Promise<void> {
    let value: number | null;

    if (
      typeof percentage === "string" &&
      (percentage === "disabled" || percentage === "0")
    ) {
      value = null;
    } else if (typeof percentage === "string" && percentage === "custom") {
      // Handle custom input in the handler
      return;
    } else if (typeof percentage === "number") {
      value = percentage;
    } else {
      value = Number(percentage);
    }

    if (value !== null && (value < 1 || value > 100)) {
      throw new Error("Stop loss percentage must be between 1% and 100%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setStopLossPercentage(value);
    await userRepository.update(user);
  }

  async setTakeProfitPercentage(
    userId: string,
    percentage: RiskPercentage | number | string
  ): Promise<void> {
    let value: number | null;

    if (
      typeof percentage === "string" &&
      (percentage === "disabled" || percentage === "0")
    ) {
      value = null;
    } else if (typeof percentage === "string" && percentage === "custom") {
      // Handle custom input in the handler
      return;
    } else if (typeof percentage === "number") {
      value = percentage;
    } else {
      value = Number(percentage);
    }

    if (value !== null && (value < 1 || value > 100)) {
      throw new Error("Take profit percentage must be between 1% and 100%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setTakeProfitPercentage(value);
    await userRepository.update(user);
  }

  async toggleAutoConvertToSol(userId: string): Promise<void> {
    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const currentValue = user.getAutoConvertToSol();
    user.setAutoConvertToSol(!currentValue);
    await userRepository.update(user);
  }

  async setSlippagePercentage(
    userId: string,
    slippage: SlippageBps | number
  ): Promise<void> {
    let value: number;

    if (typeof slippage === "string" && slippage === "custom") {
      // Handle custom input in the handler
      return;
    } else if (typeof slippage === "number") {
      value = slippage;
    } else {
      value = slippage as number;
    }

    // Convert basis points to percentage
    const percentage = value / 100;

    if (percentage < 0.1 || percentage > 10) {
      throw new Error("Slippage must be between 0.1% and 10%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setSlippagePercentage(percentage);
    await userRepository.update(user);
  }

  // Custom input handlers
  async setCustomBinRange(userId: string, customValue: string): Promise<void> {
    const value = parseInt(customValue);
    if (isNaN(value) || value < 5 || value > 100) {
      throw new Error("Custom bin range must be between 5 and 100");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setDefaultBinRange(value);
    await userRepository.update(user);
  }

  async setCustomRebalanceThreshold(
    userId: string,
    customValue: string
  ): Promise<void> {
    const value = parseFloat(customValue);
    if (isNaN(value) || value < 1 || value > 100) {
      throw new Error("Custom rebalance threshold must be between 1% and 100%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setRebalanceThreshold(value);
    await userRepository.update(user);
  }

  async setCustomStopLoss(userId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (customValue === "0" || isNaN(value)) {
      // Disable stop loss
      const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      user.setStopLossPercentage(null);
      await userRepository.update(user);
      return;
    }

    if (value < 1 || value > 100) {
      throw new Error("Custom stop loss must be between 1% and 100%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setStopLossPercentage(value);
    await userRepository.update(user);
  }

  async setCustomTakeProfit(
    userId: string,
    customValue: string
  ): Promise<void> {
    const value = parseFloat(customValue);
    if (customValue === "0" || isNaN(value)) {
      // Disable take profit
      const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
      const user = await userRepository.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      user.setTakeProfitPercentage(null);
      await userRepository.update(user);
      return;
    }

    if (value < 1 || value > 100) {
      throw new Error("Custom take profit must be between 1% and 100%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setTakeProfitPercentage(value);
    await userRepository.update(user);
  }

  async setCustomSlippage(userId: string, customValue: string): Promise<void> {
    const value = parseFloat(customValue);
    if (isNaN(value) || value < 0.1 || value > 10) {
      throw new Error("Custom slippage must be between 0.1% and 10%");
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setSlippagePercentage(value);
    await userRepository.update(user);
  }

  async setCustomSchedule(userId: string, customValue: string): Promise<void> {
    // Validate custom schedule format (e.g., "30m", "2h", "1d")
    const scheduleRegex = /^(\d+)(m|h|d)$/;
    if (!scheduleRegex.test(customValue)) {
      throw new Error(
        "Invalid schedule format. Use format like '30m', '2h', or '1d'"
      );
    }

    const userRepository = container.get<IUserRepository>(DI_TOKENS.UserRepo);
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    user.setRebalanceSchedule(customValue as RebalanceSchedule);
    await userRepository.update(user);
  }
}
