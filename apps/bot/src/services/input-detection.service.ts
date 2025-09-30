import { PoolDex } from "@/types/pool.types";
import {
  TokenInputDetection,
  TokenInputType,
  PoolType,
} from "../types/token.types";
import { solanaService } from "./solana.service";

export class InputDetectionService {
  // Regex patterns for different input types
  private readonly patterns = {
    // Solana token address: 44 characters, base58 encoded
    tokenAddress: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,

    // Meteora DAMM v1: https://www.meteora.ag/pools/{poolId}
    meteoraDammV1:
      /^https:\/\/(?:www\.)?meteora\.ag\/pools\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,

    // Meteora DAMM v2: https://www.meteora.ag/dammv2/{poolId}
    meteoraDammV2:
      /^https:\/\/(?:www\.)?meteora\.ag\/dammv2\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,

    // Meteora DLMM: https://www.meteora.ag/dlmm/{poolId}
    meteoraDlmm:
      /^https:\/\/(?:www\.)?meteora\.ag\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,

    // Saros DLMM: https://saros.xyz/dlmm/{poolId}
    sarosDlmm:
      /^https:\/\/(?:www\.)?saros\.xyz\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
  };

  /**
   * Detect the type of input and extract relevant information
   * @param input - User input string
   * @returns TokenInputDetection object with type and extracted value
   */
  detectInput(input: string): TokenInputDetection | null {
    const trimmedInput = input.trim();

    // Check for Meteora DAMM v1 URL
    const dammV1Match = trimmedInput.match(this.patterns.meteoraDammV1);
    if (dammV1Match) {
      return {
        type: "pool" as TokenInputType,
        value: dammV1Match[1],
        originalInput: trimmedInput,
        dex: "meteora" as PoolDex,
        poolType: "damm_v1" as PoolType,
      };
    }

    // Check for Meteora DAMM v2 URL
    const dammV2Match = trimmedInput.match(this.patterns.meteoraDammV2);
    if (dammV2Match) {
      return {
        type: "pool" as TokenInputType,
        value: dammV2Match[1],
        originalInput: trimmedInput,
        dex: "meteora" as PoolDex,
        poolType: "damm_v2" as PoolType,
      };
    }

    // Check for Meteora DLMM URL
    const dlmmMatch = trimmedInput.match(this.patterns.meteoraDlmm);
    if (dlmmMatch) {
      return {
        type: "pool" as TokenInputType,
        value: dlmmMatch[1],
        originalInput: trimmedInput,
        dex: "meteora" as PoolDex,
        poolType: "dlmm" as PoolType,
      };
    }

    // Check for Saros DLMM URL
    const sarosDlmmMatch = trimmedInput.match(this.patterns.sarosDlmm);
    if (sarosDlmmMatch) {
      return {
        type: "pool" as TokenInputType,
        value: sarosDlmmMatch[1],
        originalInput: trimmedInput,
        dex: "saros" as PoolDex,
        poolType: "dlmm" as PoolType,
      };
    }

    // Check for token address
    if (this.patterns.tokenAddress.test(trimmedInput)) {
      // Validate using Solana service
      if (solanaService.validateAddress(trimmedInput)) {
        return {
          type: "address",
          value: trimmedInput,
          originalInput: trimmedInput,
        };
      }
    }

    return null;
  }

  /**
   * Check if input is a valid Solana token address
   * @param input - Input string to validate
   * @returns boolean indicating if it's a valid token address
   */
  isTokenAddress(input: string): boolean {
    return (
      this.patterns.tokenAddress.test(input.trim()) &&
      solanaService.validateAddress(input.trim())
    );
  }

  /**
   * Check if input is a Meteora pool URL
   * @param input - Input string to validate
   * @returns boolean indicating if it's a Meteora URL
   */
  isMeteoraUrl(input: string): boolean {
    const trimmed = input.trim();
    return (
      this.patterns.meteoraDammV1.test(trimmed) ||
      this.patterns.meteoraDammV2.test(trimmed) ||
      this.patterns.meteoraDlmm.test(trimmed)
    );
  }

  /**
   * Check if input is a Saros pool URL
   * @param input - Input string to validate
   * @returns boolean indicating if it's a Saros URL
   */
  isSarosUrl(input: string): boolean {
    const trimmed = input.trim();
    return this.patterns.sarosDlmm.test(trimmed);
  }

  /**
   * Check if input is any supported DEX pool URL
   * @param input - Input string to validate
   * @returns boolean indicating if it's a supported DEX URL
   */
  isDexUrl(input: string): boolean {
    return this.isMeteoraUrl(input) || this.isSarosUrl(input);
  }

  /**
   * Extract pool ID from any supported DEX URL
   * @param url - DEX pool URL
   * @returns Pool ID or null if invalid
   */
  extractPoolId(url: string): string | null {
    const trimmed = url.trim();

    const dammV1Match = trimmed.match(this.patterns.meteoraDammV1);
    if (dammV1Match) return dammV1Match[1];

    const dammV2Match = trimmed.match(this.patterns.meteoraDammV2);
    if (dammV2Match) return dammV2Match[1];

    const dlmmMatch = trimmed.match(this.patterns.meteoraDlmm);
    if (dlmmMatch) return dlmmMatch[1];

    const sarosDlmmMatch = trimmed.match(this.patterns.sarosDlmm);
    if (sarosDlmmMatch) return sarosDlmmMatch[1];

    return null;
  }

  /**
   * Get the Meteora pool type from URL
   * @param url - Meteora pool URL
   * @returns Pool type or null if invalid
   * @deprecated Use detectInput() instead for better type information
   */
  getMeteoraPoolType(url: string): "damm_v1" | "damm_v2" | "dlmm" | null {
    const trimmed = url.trim();

    if (this.patterns.meteoraDammV1.test(trimmed)) return "damm_v1";
    if (this.patterns.meteoraDammV2.test(trimmed)) return "damm_v2";
    if (this.patterns.meteoraDlmm.test(trimmed)) return "dlmm";

    return null;
  }

  /**
   * Get the DEX name from URL
   * @param url - DEX pool URL
   * @returns DEX name or null if invalid
   * @deprecated Use detectInput() instead for better type information
   */
  getDexName(url: string): "meteora" | "saros" | null {
    const trimmed = url.trim();

    if (this.isMeteoraUrl(trimmed)) return "meteora";
    if (this.isSarosUrl(trimmed)) return "saros";

    return null;
  }

  /**
   * Get the pool type from any supported DEX URL
   * @param url - DEX pool URL
   * @returns Pool type or null if invalid
   * @deprecated Use detectInput() instead for better type information
   */
  getPoolType(url: string): "damm_v1" | "damm_v2" | "dlmm" | null {
    const trimmed = url.trim();

    // Check Meteora patterns
    if (this.patterns.meteoraDammV1.test(trimmed)) return "damm_v1";
    if (this.patterns.meteoraDammV2.test(trimmed)) return "damm_v2";
    if (this.patterns.meteoraDlmm.test(trimmed)) return "dlmm";

    // Check Saros patterns
    if (this.patterns.sarosDlmm.test(trimmed)) return "dlmm";

    return null;
  }
}

export const inputDetectionService = new InputDetectionService();
