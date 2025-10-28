import { config } from "dotenv";

config();

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

  REDIS: {
    URL: process.env.REDIS_URL || "redis://localhost:6379",
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
  LOG_LEVEL,
} = CONFIG;
