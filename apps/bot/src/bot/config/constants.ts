import { DexType } from "@/types/core.types";

export const OPEN_POSITION_FEE = 1; // 1%
export const REBALANCING_FEE = 0.15; // 0.15%

export const SLIPPAGE_SMALL = 0.005; // 0.5%
export const SLIPPAGE_MEDIUM = 0.01; // 1%
export const SLIPPAGE_LARGE = 0.05; // 5%

export const BUFFER_AMOUNT = 0.01;

export const TOTAL_RANGE_INTERVAL = 20;

// Selected DEX for the bot runtime. Set via env BOT_DEX or DEX (meteora|saros|orca|raydium)
const RAW_SELECTED_DEX = (process.env.BOT_DEX || process.env.DEX || "meteora").toLowerCase();
const SUPPORTED_DEXES: DexType[] = ["meteora", "saros", "orca", "raydium"];
export const SELECTED_DEX: DexType = (SUPPORTED_DEXES as string[]).includes(RAW_SELECTED_DEX)
  ? (RAW_SELECTED_DEX as DexType)
  : ("meteora" as DexType);

// trending
export const TRENDING_CONSTANTS = {
  DEFAULT_LIMIT: 5,
  PAGE_SIZE: 5,

  CACHE_TTL_MS: 5 * 60 * 1000,
  MAX_CACHED_CHATS: 100,

  SYMBOL_FALLBACK_LENGTH: 4,

  NUMBER_FORMATTING: {
    BILLION_THRESHOLD: 1e9,
    MILLION_THRESHOLD: 1e6,
    THOUSAND_THRESHOLD: 1e3,
  },
} as const;

// export const METEORA_CONSTANTS = {
//   PAGE_SIZE: 50,

//   MIN_VOLUME_THRESHOLD: 100,
//   MIN_LIQUIDITY_THRESHOLD: 1000,
//   TRENDING_TVL_THRESHOLD: 5000,

//   SORT_CONFIG: {
//     KEY: "volume12h" as "volume12h" | "tvl" | "lm",
//     ORDER: "desc",
//   },
// } as const;

export const TRENDING_MESSAGES = {
  FETCHING: "🔍 Fetching trending tokens...",
  NO_RESULTS:
    "❌ No trending tokens found at the moment. Please try again later.",
  ERROR_GENERIC: "⚠️ Error fetching trending tokens. Please try again later.",
  ERROR_NAVIGATION: "❌ Cannot navigate in that direction.",
  ERROR_UNAUTHORIZED: "❌ This button is not for you.",
  ERROR_OCCURRED: "❌ Error occurred.",
  FOOTER_TEXT: "_Click Dex link to view token details_",
} as const;

//button-labels
export const TRENDING_BUTTONS = {
  PREV: "◀️ Prev",
  NEXT: "Next ▶️",
  REFRESH: "🔄 Refresh",
} as const;
