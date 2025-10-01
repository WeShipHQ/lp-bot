import { dexRegistry } from "./dex-registry.service";
import { DexType, UrlParseResult } from "../types/core.types";

export interface InputDetectionResult {
  type: "pool" | "token" | "unknown";
  dex?: DexType;
  poolId?: string;
  poolType?: string;
  tokenAddress?: string;
  originalInput: string;
}

export class UnifiedInputDetectionService {
  private readonly tokenAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  detectInput(input: string): InputDetectionResult | null {
    const trimmed = input.trim();

    const urlResult = dexRegistry.parseUrl(trimmed);
    if (urlResult) {
      return {
        type: "pool",
        dex: urlResult.result.dex,
        poolId: urlResult.result.poolId,
        poolType: urlResult.result.poolType,
        originalInput: trimmed,
      };
    }

    if (this.isTokenAddress(trimmed)) {
      return {
        type: "token",
        tokenAddress: trimmed,
        originalInput: trimmed,
      };
    }

    return {
      type: "unknown",
      originalInput: trimmed,
    };
  }

  isTokenAddress(input: string): boolean {
    return this.tokenAddressPattern.test(input.trim());
  }

  isDexUrl(input: string): boolean {
    return dexRegistry.parseUrl(input.trim()) !== null;
  }

  isDexUrlForType(input: string, dexType: DexType): boolean {
    try {
      const adapter = dexRegistry.get(dexType);
      return adapter.isValidPoolUrl(input.trim());
    } catch {
      return false;
    }
  }

  getSupportedUrlPatterns(): Record<DexType, string[]> {
    const patterns: Record<string, string[]> = {};

    for (const adapter of dexRegistry.getEnabled()) {
      // This would need to be implemented in each adapter
      // For now, return empty arrays
      patterns[adapter.dexType] = [];
    }

    return patterns as Record<DexType, string[]>;
  }

  extractPoolId(url: string): { dex: DexType; poolId: string } | null {
    const result = dexRegistry.parseUrl(url.trim());
    return result
      ? { dex: result.result.dex, poolId: result.result.poolId }
      : null;
  }
}

export const unifiedInputDetectionService = new UnifiedInputDetectionService();
