import { config } from "dotenv";

// Load environment variables
config();

export const CONFIG = {
  // Server Configuration
  PORT: parseInt(process.env.PORT || "3000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database
  DATABASE_URL:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/meteora_bot",

  // Telegram Bot
  TELEGRAM: {
    BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL || "",
  },

  PRIVY: {
    PRIVY_APP_ID: process.env.PRIVY_APP_ID as string,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET as string,
    PRIVI_AUTH_ID: process.env.PRIVI_AUTH_ID as string,
    PRIVY_AUTH_PRIVATE_KEY: process.env.PRIVY_AUTH_PRIVATE_KEY as string,
  },

  // Solana Configuration
  SOLANA: {
    RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    NETWORK: process.env.SOLANA_NETWORK || "devnet",
  },

  // Meteora SDK Configuration
  METEORA: {
    API_URL: process.env.METEORA_API_URL || "https://dlmm-api.meteora.ag",
  },

  // Redis Configuration
  REDIS: {
    URL: process.env.REDIS_URL || "redis://localhost:6379",
    HOST: process.env.REDIS_HOST || "localhost",
    PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
    PASSWORD: process.env.REDIS_PASSWORD || "",
  },

  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "",

  // Auto-rebalancing Configuration
  REBALANCING: {
    ENABLED: true,
    INTERVAL_MINUTES: parseInt(
      process.env.REBALANCE_INTERVAL_MINUTES || "60",
      10
    ),
    DEFAULT_THRESHOLD: parseFloat(
      process.env.DEFAULT_REBALANCE_THRESHOLD || "5.0"
    ),
    MAX_GAS_PRICE_SOL: parseFloat(process.env.MAX_GAS_PRICE_SOL || "0.01"),
  },

  // Monitoring and Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
  SENTRY_DSN: process.env.SENTRY_DSN || "",

  // Rate Limiting
  RATE_LIMIT: {
    WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
    MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10),
  },

  // Security
  JWT_SECRET: process.env.JWT_SECRET || "",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
};

// Validation function
export function validateConfig(): void {
  const requiredVars = ["TELEGRAM_BOT_TOKEN", "DATABASE_URL", "ENCRYPTION_KEY"];

  const missing = requiredVars.filter((varName) => {
    const value = process.env[varName];
    return !value || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Validate encryption key length
  if (CONFIG.ENCRYPTION_KEY.length < 32) {
    throw new Error("ENCRYPTION_KEY must be at least 32 characters long");
  }
}

// Export individual configs for convenience
export const {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  TELEGRAM,
  SOLANA,
  METEORA,
  REDIS,
  ENCRYPTION_KEY,
  REBALANCING,
  LOG_LEVEL,
  SENTRY_DSN,
  RATE_LIMIT,
  JWT_SECRET,
  CORS_ORIGIN,
} = CONFIG;
