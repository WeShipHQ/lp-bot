// import { UserSettings } from "@/application/settings/get-user-settings.use-case";
import {
  GasPriority,
  RebalanceSchedule,
  BinRange,
  RiskPercentage,
  SlippageBps,
} from "../constants/settings.constants";
import { divider } from "@/utils/misc";
import { UserPreferences } from "@/domain";

// export interface SettingsMessageModel {
//   vaultAddress?: string | null;
//   gasPriority: GasPriority;
//   rebalancingSchedule: string;

//   // New settings
//   autoRebalanceEnabled: boolean;
//   rebalanceThreshold: string;
//   defaultBinRange: string;
//   stopLossPercentage: string | null;
//   takeProfitPercentage: string | null;
//   autoConvertToSol: boolean;
//   slippagePercentage: string;
// }

export class SettingsFormatter {
  static formatOverview(model: UserPreferences): string {
    const lines: string[] = [];
    lines.push("⚙️ *Settings*\n");

    // Rebalancing Settings
    lines.push("🔄 *Rebalancing*");
    lines.push(
      `• Auto Rebalance: ${model.autoRebalanceEnabled ? "✅ Enabled" : "❌ Disabled"}`
    );
    lines.push(`• Schedule: ${model.rebalanceSchedule}`);
    lines.push(`• Threshold: ${model.rebalanceThreshold}%`);

    // Position Configuration
    lines.push("\n📊 *Position Configuration*");
    lines.push(`• Default Bin Range: ${model.defaultBinRange}`);

    // Risk Management
    lines.push("\n⚠️ *Risk Management*");
    lines.push(`• Stop Loss: ${model.stopLossPercentage || "❌ Disabled"}`);
    lines.push(`• Take Profit: ${model.takeProfitPercentage || "❌ Disabled"}`);

    // Trading Settings
    lines.push("\n💰 *Trading Settings*");
    lines.push(
      `• Auto Convert to SOL: ${model.autoConvertToSol ? "✅ Enabled" : "❌ Disabled"}`
    );
    lines.push(`• Slippage: ${model.slippagePercentage}%`);

    lines.push(divider("-", 50));

    return lines.join("\n");
  }

  static promptVaultAddress(): string {
    return "🔑 Please enter your new vault address.";
  }

  static promptCustomSchedule(): string {
    return "🕒 Please enter your rebalancing schedule (e.g., 30m, 2h, 1d).";
  }

  static promptCustomBinRange(): string {
    return "📊 Please enter your default bin range (5-100). This determines the price range for your DLMM positions.";
  }

  static promptCustomRebalanceThreshold(): string {
    return "🔄 Please enter your rebalance threshold percentage (10-30). This triggers rebalancing when price moves outside range by this percentage.";
  }

  static promptCustomStopLoss(): string {
    return "⚠️ Please enter your stop loss percentage (1-100). This will automatically close positions if price drops by this percentage. Enter '0' to disable.";
  }

  static promptCustomTakeProfit(): string {
    return "🎯 Please enter your take profit percentage (1-100). This will automatically close positions if price rises by this percentage. Enter '0' to disable.";
  }

  static promptCustomSlippage(): string {
    return "💰 Please enter your slippage percentage (0.1-10). This protects against price changes during trades.";
  }

  static updated(message: string): string {
    return `✅ ${message}`;
  }

  static formatBinRange(range: number | string): string {
    if (range === "custom") return "Custom";
    return `${range} bins`;
  }

  static formatRiskPercentage(value: number | string | null): string {
    if (value === null || value === "disabled") return "Disabled";
    if (value === "custom") return "Custom";
    return `${value}%`;
  }

  static formatSlippage(bps: number | string): string {
    if (bps === "custom") return "Custom";
    return `${(Number(bps) / 100).toFixed(2)}%`;
  }
}
