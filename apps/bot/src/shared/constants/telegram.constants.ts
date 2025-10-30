export const TELEGRAM_MESSAGES = {
  SYSTEM: {
    ERROR_GENERIC: '❌ Something went wrong. Please try again later.',
    ERROR_NETWORK: '❌ Network error. Please check your connection and try again.',
    ERROR_TIMEOUT: '⏱️ Request timed out. Please try again.',
    ERROR_MAINTENANCE: '🔧 Bot is under maintenance. Please try again later.',
    PRIVATE_CHAT_REQUIRED: '❌ Please start the bot in a private chat with me.',
    PROCESSING: '⏳ Processing your request...',
    SUCCESS: '✅ Operation completed successfully!',
  },

  LOADING: {
    FETCHING_DATA: '📊 Fetching data...',
    UPDATING: '🔄 Updating...',
    CONNECTING: '🔗 Connecting...',
    CALCULATING: '🧮 Calculating...',
  },

  VALIDATION: {
    INVALID_INPUT: '❌ Invalid input. Please try again.',
    MISSING_REQUIRED: '❌ Required information is missing.',
    FORMAT_ERROR: '❌ Please check the format and try again.',
  },

  FEEDBACK: {
    BUTTON_NOT_FOR_YOU: '❌ This button is not for you.',
    EXPIRED_ACTION: '❌ This action has expired. Please try again.',
    UNAUTHORIZED: '❌ You are not authorized to perform this action.',
  },

  WELCOME: {
    NEW_USER: '🎉 Welcome to Meteora Liquidity Bot!',
    RETURNING_USER: '👋 Welcome back!',
    WITH_WALLET: '💼 Your wallet is connected and ready to use.',
    WITHOUT_WALLET: '🔗 Connect your wallet to get started with liquidity provision.',
  },

  REFERRAL: {
    SUCCESS: "🎉 Welcome! You've been referred by a friend and earned 50 bonus points!",
    INVALID: '⚠️ Invalid or expired referral code',
    ALREADY_USED: "ℹ️ You've already used a referral code.",
  },
} as const;

export const TELEGRAM_LIMITS = {
  MESSAGE_LENGTH: 4096,
  CAPTION_LENGTH: 1024,
  BUTTON_TEXT_LENGTH: 64,
  CALLBACK_DATA_LENGTH: 64,
  INLINE_KEYBOARD_BUTTONS_PER_ROW: 8,
  INLINE_KEYBOARD_ROWS: 100,
} as const;

export const TELEGRAM_RATE_LIMITS = {
  MESSAGES_PER_SECOND: 30,
  MESSAGES_PER_MINUTE: 20,
  MESSAGES_TO_SAME_CHAT_PER_SECOND: 1,
} as const;
