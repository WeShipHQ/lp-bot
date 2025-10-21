import { InlineKeyboardMarkup } from "telegraf/types";

const CALLBACK_DATA = {
  SETUP: "setupTwoFactor",
  STATUS: "twoFactorStatus", 
  DISABLE: "disableTwoFactor",
  VERIFY_READY: "verifyTwoFactorReady",
  BACK_TO_MENU: "back_to_2fa_menu"
} as const;

export function getTwoFactorKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔐 Setup 2FA", callback_data: CALLBACK_DATA.SETUP },
        { text: "📊 Check Status", callback_data: CALLBACK_DATA.STATUS }
      ],
      [
        { text: "❌ Disable 2FA", callback_data: CALLBACK_DATA.DISABLE }
      ],
    ]
  };
}

export function getTwoFactorSetupKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ I'm Ready to Verify", callback_data: CALLBACK_DATA.VERIFY_READY }
      ],
      [
        { text: "🔙 Back to 2FA Menu", callback_data: CALLBACK_DATA.BACK_TO_MENU }
      ]
    ]
  };
}

export function getTwoFactorStatusKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔐 Setup 2FA", callback_data: CALLBACK_DATA.SETUP }
      ],
      [
        { text: "🔙 Back to 2FA Menu", callback_data: CALLBACK_DATA.BACK_TO_MENU }
      ]
    ]
  };
}
