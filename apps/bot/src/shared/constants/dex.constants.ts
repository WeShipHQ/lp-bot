export const DEX_NAMES = {
  meteora: 'Meteora',
  saros: 'Saros',
  orca: 'Orca',
  raydium: 'Raydium',
} as const;

export const DEX_EMOJIS = {
  meteora: '🟣',
  saros: '🟢',
  orca: '🔵',
  raydium: '🟡',
} as const;

export const DEX_URLS = {
  meteora: 'https://app.meteora.ag',
  saros: 'https://saros.finance',
  orca: 'https://www.orca.so',
  raydium: 'https://raydium.io',
} as const;

export const POOL_TYPES = {
  DLMM: 'Dynamic Liquidity Market Maker',
  DAMM: 'Dynamic Automated Market Maker',
  CLMM: 'Concentrated Liquidity Market Maker',
  AMM: 'Automated Market Maker',
} as const;

export const POSITION_STATUS = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  REBALANCING: 'Rebalancing',
} as const;

export const TRENDING_CONSTANTS = {
  DEFAULT_LIMIT: 5,
  PAGE_SIZE: 5,
  MAX_PAGE_SIZE: 20,
  CACHE_TTL_SECONDS: 300,
  MAX_CACHED_CHATS: 100,
  SYMBOL_FALLBACK_LENGTH: 4,
  MIN_TVL_THRESHOLD: 1000,
  MIN_VOLUME_THRESHOLD: 100,
} as const;

export const POSITION_LIMITS = {
  MIN_POSITION_VALUE_USD: 1,
  MAX_POSITIONS_PER_USER: 50,
  MIN_REBALANCE_THRESHOLD: 1,
  MAX_REBALANCE_THRESHOLD: 100,
  DEFAULT_REBALANCE_THRESHOLD: 20,
} as const;

export const SLIPPAGE_PRESETS = {
  LOW: 0.1,
  MEDIUM: 0.5,
  HIGH: 1.0,
  VERY_HIGH: 3.0,
  DEFAULT: 0.5,
} as const;
