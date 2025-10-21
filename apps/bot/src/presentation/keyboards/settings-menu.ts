import { InlineKeyboardMarkup } from "@telegraf/types";
import { GasPriority, RebalanceSchedule, ST_CALLBACKS } from "../constants/settings.constants";

export interface SettingsViewModel {
  vaultAddress?: string | null;
  gasPriority: GasPriority;
  rebalancingSchedule: RebalanceSchedule | string; // allow custom strings like "2h" or cron-like values
}

export function getSettingsKeyboard(_settings: SettingsViewModel): InlineKeyboardMarkup {
  // For now we always show the same actions; in future we can highlight current selections
  return {
    inline_keyboard: [
      [{ text: "Set Vault Address", callback_data: ST_CALLBACKS.vaultSet }],
      [
        { text: "Gas: Low", callback_data: ST_CALLBACKS.gasSet("low") },
        { text: "Gas: Medium", callback_data: ST_CALLBACKS.gasSet("medium") },
        { text: "Gas: High", callback_data: ST_CALLBACKS.gasSet("high") },
      ],
      [
        { text: "Sched: 15m", callback_data: ST_CALLBACKS.scheduleSet("15m") },
        { text: "1h", callback_data: ST_CALLBACKS.scheduleSet("1h") },
        { text: "4h", callback_data: ST_CALLBACKS.scheduleSet("4h") },
      ],
      [
        { text: "12h", callback_data: ST_CALLBACKS.scheduleSet("12h") },
        { text: "1d", callback_data: ST_CALLBACKS.scheduleSet("1d") },
        { text: "Custom", callback_data: ST_CALLBACKS.scheduleSet("custom") },
      ],
      [{ text: "Refresh", callback_data: ST_CALLBACKS.refresh }],
    ],
  };
}
