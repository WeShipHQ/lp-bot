import { DexType } from "@/types/core.types";

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
    enabled: false,
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

export function getDexConfig(dexType: DexType): DexConfig {
  return DEX_CONFIGS[dexType];
}

export function isDexEnabled(dexType: DexType): boolean {
  return DEX_CONFIGS[dexType]?.enabled ?? false;
}

export function getEnabledDexTypes(): DexType[] {
  return Object.entries(DEX_CONFIGS)
    .filter(([_, config]) => config.enabled)
    .map(([dexType, _]) => dexType as DexType);
}
