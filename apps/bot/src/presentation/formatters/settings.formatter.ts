import { GasPriority } from "../constants/settings.constants";

export interface SettingsMessageModel {
  vaultAddress?: string | null;
  gasPriority: GasPriority;
  rebalancingSchedule: string; // human-readable
}

export class SettingsFormatter {
  static formatOverview(model: SettingsMessageModel): string {
    const vault = model.vaultAddress && model.vaultAddress.trim().length > 0 ? model.vaultAddress : "Not set";
    const gasLabel = model.gasPriority === "low"
      ? "Low (0.00005 SOL)"
      : model.gasPriority === "high"
        ? "High (0.0002 SOL)"
        : "Medium (0.0001 SOL)";

    const lines: string[] = [];
    lines.push("⚙️ Manage Settings\n");
    lines.push(`Your Vault Address: ${vault}`);
    lines.push("");
    lines.push(`Gas Priority Fee: ${gasLabel}`);
    lines.push("");
    lines.push("Default Settings:");
    lines.push(`Rebalancing Schedule: ${model.rebalancingSchedule}`);

    return lines.join("\n");
  }

  static promptVaultAddress(): string {
    return "🔑 Please enter your new vault address.";
  }

  static promptCustomSchedule(): string {
    return "🕒 Please enter your rebalancing schedule (e.g., 30m, 2h, 1d).";
  }

  static updated(message: string): string {
    return `✅ ${message}`;
  }
}
