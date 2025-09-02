// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getMainKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: "🚀 Open Position", callback_data: "open_position" }],
      [
        { text: "💼 Portfolio", callback_data: "portfolio" },
        { text: "💰 Wallet", callback_data: "wallet" },
      ],
      [
        { text: "🔐 2FA", callback_data: "two_factor_auth" },
        { text: "⚙️ Settings", callback_data: "settings" },
      ],
      [
        { text: "❓ Help", callback_data: "help" },
      ],
    ],
  };
}
