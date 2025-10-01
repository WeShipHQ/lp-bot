import { DexType } from "../types/core.types";

/**
 * Configuration for DEX adapters
 */
export interface DexConfig {
  enabled: boolean;
  apiUrl?: string;
  rpcUrl?: string;
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requests: number;
    window: number; // in milliseconds
  };
}

export const DEX_CONFIGS: Record<DexType, DexConfig> = {
  meteora: {
    enabled: true,
    apiUrl: "https://dlmm-api.meteora.ag",
    timeout: 10000,
    retries: 3,
    rateLimit: {
      requests: 100,
      window: 60000, // 1 minute
    },
  },
  saros: {
    enabled: true,
    apiUrl: "https://api.saros.xyz/api/dex-v3",
    timeout: 10000,
    retries: 3,
    rateLimit: {
      requests: 100,
      window: 60000,
    },
  },
  orca: {
    enabled: false, // Not implemented yet
    timeout: 10000,
    retries: 3,
  },
  raydium: {
    enabled: false, // Not implemented yet
    timeout: 10000,
    retries: 3,
  },
};

/**
 * Get configuration for a specific DEX
 */
export function getDexConfig(dexType: DexType): DexConfig {
  return DEX_CONFIGS[dexType];
}

/**
 * Check if a DEX is enabled in configuration
 */
export function isDexEnabled(dexType: DexType): boolean {
  return DEX_CONFIGS[dexType]?.enabled ?? false;
}

/**
 * Get all enabled DEX types from configuration
 */
export function getEnabledDexTypes(): DexType[] {
  return Object.entries(DEX_CONFIGS)
    .filter(([_, config]) => config.enabled)
    .map(([dexType, _]) => dexType as DexType);
}