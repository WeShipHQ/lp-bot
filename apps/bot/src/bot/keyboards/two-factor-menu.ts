import { InlineKeyboardMarkup } from "telegraf/types";

export function getTwoFactorKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔐 Setup 2FA", callback_data: "setupTwoFactor" },
        { text: "📊 Check Status", callback_data: "twoFactorStatus" }
      ],
      [
        { text: "❌ Disable 2FA", callback_data: "disableTwoFactor" }
      ],
    ]
  };
}

export function getTwoFactorSetupKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ I'm Ready to Verify", callback_data: "verifyTwoFactorReady" }
      ],
      [
        { text: "🔙 Back to 2FA Menu", callback_data: "back_to_2fa_menu" }
      ]
    ]
  };
}

export function getTwoFactorStatusKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔐 Setup 2FA", callback_data: "setupTwoFactor" }
      ],
      [
        { text: "🔙 Back to 2FA Menu", callback_data: "back_to_2fa_menu" }
      ]
    ]
  };
}
