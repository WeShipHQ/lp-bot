import { InlineKeyboardMarkup } from "@telegraf/types";
import {
  RebalanceSchedule,
  BinRange,
  RiskPercentage,
  SlippageBps,
  ST_CALLBACKS,
} from "../constants/settings.constants";
import { UserPreferences } from "@/domain";

export function getSettingsKeyboard(
  settings: UserPreferences
): InlineKeyboardMarkup {
  const keyboard = [];

  keyboard.push([
    {
      text: `🔄 Auto Rebalance: ${settings.autoRebalanceEnabled ? "✅" : "❌"}`,
      callback_data: ST_CALLBACKS.toggleRebalance,
    },
  ]);

  if (settings.autoRebalanceEnabled) {
    keyboard.push([
      {
        text: `⏰ Schedule: ${settings.rebalanceSchedule}`,
        callback_data: "schedule_menu",
      },
      {
        text: `📊 Threshold: ${settings.rebalanceThreshold}%`,
        callback_data: "threshold_menu",
      },
    ]);
  }

  // Position Configuration
  keyboard.push([
    {
      text: `📊 Bin Range: ${typeof settings.defaultBinRange === "number" ? settings.defaultBinRange + " bins" : "Custom"}`,
      callback_data: "bin_menu",
    },
  ]);

  // Risk Management
  keyboard.push([
    {
      text: `⚠️ Stop Loss: ${formatRiskPercentage(settings.stopLossPercentage)}`,
      callback_data: "sl_menu",
    },
    {
      text: `🎯 Take Profit: ${formatRiskPercentage(settings.takeProfitPercentage)}`,
      callback_data: "tp_menu",
    },
  ]);

  // Trading Settings
  keyboard.push([
    {
      text: `💰 Auto Convert: ${settings.autoConvertToSol ? "✅" : "❌"}`,
      callback_data: ST_CALLBACKS.toggleAutoConvert,
    },
  ]);

  keyboard.push([
    {
      text: `💰 Slippage: ${formatSlippage(settings.slippagePercentage)}`,
      callback_data: "slippage_menu",
    },
  ]);

  keyboard.push([{ text: "🔄 Refresh", callback_data: ST_CALLBACKS.refresh }]);

  return { inline_keyboard: keyboard };
}

// Helper keyboards for sub-menus
export function getScheduleKeyboard(
  current: RebalanceSchedule | string
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "5m", callback_data: ST_CALLBACKS.scheduleSet("5m") },
        { text: "15m", callback_data: ST_CALLBACKS.scheduleSet("15m") },
        { text: "1h", callback_data: ST_CALLBACKS.scheduleSet("1h") },
      ],
      [
        { text: "3h", callback_data: ST_CALLBACKS.scheduleSet("3h") },
        {
          text: "Disabled",
          callback_data: ST_CALLBACKS.scheduleSet("disabled"),
        },
        { text: "Custom", callback_data: ST_CALLBACKS.scheduleSet("custom") },
      ],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

export function getBinRangeKeyboard(
  current: BinRange | number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "5", callback_data: ST_CALLBACKS.binRange(5) },
        { text: "10", callback_data: ST_CALLBACKS.binRange(10) },
        { text: "20", callback_data: ST_CALLBACKS.binRange(20) },
      ],
      [{ text: "Custom", callback_data: ST_CALLBACKS.binRange("custom") }],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

export function getRebalanceThresholdKeyboard(
  current: number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "10%", callback_data: ST_CALLBACKS.rebalanceThreshold("10") },
        { text: "15%", callback_data: ST_CALLBACKS.rebalanceThreshold("15") },
        { text: "20%", callback_data: ST_CALLBACKS.rebalanceThreshold("20") },
      ],
      [
        { text: "25%", callback_data: ST_CALLBACKS.rebalanceThreshold("25") },
        { text: "30%", callback_data: ST_CALLBACKS.rebalanceThreshold("30") },
        {
          text: "Custom",
          callback_data: ST_CALLBACKS.rebalanceThreshold("custom"),
        },
      ],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

export function getStopLossKeyboard(
  current: RiskPercentage | number | null
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "10%", callback_data: ST_CALLBACKS.stopLoss(10) },
        { text: "25%", callback_data: ST_CALLBACKS.stopLoss(25) },
        { text: "50%", callback_data: ST_CALLBACKS.stopLoss(50) },
      ],
      [
        { text: "Custom", callback_data: ST_CALLBACKS.stopLoss("custom") },
        { text: "Disabled", callback_data: ST_CALLBACKS.stopLoss("disabled") },
      ],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

export function getTakeProfitKeyboard(
  current: RiskPercentage | number | null
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "10%", callback_data: ST_CALLBACKS.takeProfit(10) },
        { text: "25%", callback_data: ST_CALLBACKS.takeProfit(25) },
        { text: "50%", callback_data: ST_CALLBACKS.takeProfit(50) },
      ],
      [
        { text: "Custom", callback_data: ST_CALLBACKS.takeProfit("custom") },
        {
          text: "Disabled",
          callback_data: ST_CALLBACKS.takeProfit("disabled"),
        },
      ],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

export function getSlippageKeyboard(
  current: SlippageBps | number
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "0.5%", callback_data: ST_CALLBACKS.slippage(50) },
        { text: "1%", callback_data: ST_CALLBACKS.slippage(100) },
        { text: "3%", callback_data: ST_CALLBACKS.slippage(300) },
      ],
      [
        { text: "5%", callback_data: ST_CALLBACKS.slippage(500) },
        { text: "Custom", callback_data: ST_CALLBACKS.slippage("custom") },
      ],
      [{ text: "⬅️ Back", callback_data: "back_to_main" }],
    ],
  };
}

// Helper functions
function formatRiskPercentage(value: number | string | null): string {
  if (value === null || value === "disabled") return "Disabled";
  if (value === "custom") return "Custom";
  return `${value}%`;
}

function formatSlippage(bps: number | string): string {
  if (bps === "custom") return "Custom";
  return `${(Number(bps) / 100).toFixed(2)}%`;
}
