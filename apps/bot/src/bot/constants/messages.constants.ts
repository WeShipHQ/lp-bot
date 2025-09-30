export const GLOBAL_MESSAGES = {
  // System Messages
  SYSTEM: {
    ERROR_GENERIC: "❌ Something went wrong. Please try again later.",
    ERROR_NETWORK:
      "❌ Network error. Please check your connection and try again.",
    ERROR_TIMEOUT: "⏱️ Request timed out. Please try again.",
    ERROR_MAINTENANCE: "🔧 Bot is under maintenance. Please try again later.",
    PRIVATE_CHAT_REQUIRED: "❌ Please start the bot in a private chat with me.",
    PROCESSING: "⏳ Processing your request...",
    SUCCESS: "✅ Operation completed successfully!",
  },

  // Loading States
  LOADING: {
    FETCHING_DATA: "📊 Fetching data...",
    UPDATING: "🔄 Updating...",
    CONNECTING: "🔗 Connecting...",
    CALCULATING: "🧮 Calculating...",
  },

  // Validation Messages
  VALIDATION: {
    INVALID_INPUT: "❌ Invalid input. Please try again.",
    MISSING_REQUIRED: "❌ Required information is missing.",
    FORMAT_ERROR: "❌ Please check the format and try again.",
  },

  // User Feedback
  FEEDBACK: {
    BUTTON_NOT_FOR_YOU: "❌ This button is not for you.",
    EXPIRED_ACTION: "❌ This action has expired. Please try again.",
    UNAUTHORIZED: "❌ You are not authorized to perform this action.",
  },
} as const;

export const START_MESSAGES = {
  // Welcome Messages
  WELCOME: {
    NEW_USER: "🎉 Welcome to Meteora Liquidity Bot!",
    RETURNING_USER: "👋 Welcome back!",
    WITH_WALLET: "💼 Your wallet is connected and ready to use.",
    WITHOUT_WALLET:
      "🔗 Connect your wallet to get started with liquidity provision.",
  },

  // Referral Messages
  REFERRAL: {
    SUCCESS:
      "🎉 Welcome! You've been referred by a friend and earned 50 bonus points!",
    INVALID: "⚠️ Invalid or expired referral code",
    ALREADY_USED: "ℹ️ You've already used a referral code.",
  },

  // Error Messages
  ERRORS: {
    USER_CREATION_FAILED: "❌ Error creating user account",
    BALANCE_FETCH_FAILED: "⚠️ Could not fetch wallet balance",
    DEEP_LINK_INVALID: "❌ Invalid link. Please try again.",
  },

  // Action Messages
  ACTIONS: {
    REDIRECTING_TO_POSITION: "🔗 Opening position details...",
    REDIRECTING_TO_POOL: "🔗 Opening pool details...",
  },
} as const;
