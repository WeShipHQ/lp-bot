import { InlineKeyboardMarkup } from "@telegraf/types";

export function getMainKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 Open Position", callback_data: "open_position" }],
      [
        { text: "💼 Portfolio", callback_data: "portfolio" },
        { text: "💰 Wallet", callback_data: "wallet" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "settings" },
        { text: "❓ Help", callback_data: "help" },
      ],
    ],
  };
}
