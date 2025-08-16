// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getWalletKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "💰 Deposit SOL", callback_data: "deposit_sol" }],
      [{ text: "📤 Send SOL", callback_data: "send_sol" }],
      [{ text: "📋 Transaction History", callback_data: "transaction_history" }],
      [{ text: "🔙 Back to Menu", callback_data: "main_menu" }],
    ],
  };
}