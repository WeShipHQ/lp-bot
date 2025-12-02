import { config } from "dotenv";

config();

const userCacheTtl = Number.parseInt(process.env.USER_CACHE_TTL ?? "", 10);

export const CONFIG = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",

  DATABASE_URL: process.env.DATABASE_URL!,

  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME || "",
    WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL || "",
  },

  PRIVY: {
    PRIVY_APP_ID: process.env.PRIVY_APP_ID as string,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET as string,
    PRIVY_AUTH_ID: process.env.PRIVY_AUTH_ID as string,
    PRIVY_AUTH_PRIVATE_KEY: process.env.PRIVY_AUTH_PRIVATE_KEY as string,
  },

  SOLANA: {
    RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    NETWORK: process.env.SOLANA_NETWORK || "mainnet",
    HELIUS_API_KEY: process.env.HELIUS_API_KEY || "",
  },

  SANCTUM: {
    API_KEY: process.env.SANCTUM_API_KEY || "",
    ENABLED: process.env.SANCTUM_ENABLED === "true",
  },

  OPENAI: {
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY || "",
  },

  REDIS: {
    URL: process.env.REDIS_URL || "redis://localhost:6379",
  },

  CACHE: {
    USER_CACHE_ENABLED: process.env.USER_CACHE_ENABLED !== "false",
    USER_CACHE_TTL: Number.isFinite(userCacheTtl) ? userCacheTtl : 300,
  },

  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
};

export const {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  TELEGRAM,
  SOLANA,
  SANCTUM,
  REDIS,
  CACHE,
  LOG_LEVEL,
} = CONFIG;
