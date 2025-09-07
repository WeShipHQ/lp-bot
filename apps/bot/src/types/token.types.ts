import type { MeteoraPoolData } from "./meteora.types";

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri?: string;
}

export interface TokenInfo extends Token {
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  liquidity: number;
  isVerified: boolean;
  source: "jupiter" | "meteora";
}

export interface TokenPrice {
  id: string;
  timestamp: number;
  price: number;
  blockId: number;
  decimals: number;
  priceChange24h: number;
}

export interface TokenDisplayData {
  token: TokenInfo;
  poolInfo?: MeteoraPoolData;
  error?: string;
}

export type TokenInputType =
  | "address"
  | "meteora_damm_v1"
  | "meteora_damm_v2"
  | "meteora_dlmm"
  | "start_param";

export interface TokenInputDetection {
  type: TokenInputType;
  value: string; // token address or pool id
  originalInput: string;
}

// pricing service
export enum PricingTokenPriority {
  HIGH = "HIGH_PRIORITY", // Volatile meme coins, trending tokens
  MEDIUM = "MEDIUM_PRIORITY", // SOL, USDC, JUP, major tokens
  LOW = "LOW_PRIORITY", // Stable, rarely accessed tokens
}

export interface PricingTokenConfig {
  address: string;
  symbol: string;
  priority: PricingTokenPriority;
  updateInterval: number; // in seconds
}

export interface CachedPrice {
  price: TokenPrice;
  timestamp: number;
  priority: PricingTokenPriority;
}

export interface PriceRequest {
  tokenAddress: string;
  resolve: (price: TokenPrice | null) => void;
  reject: (error: Error) => void;
  timestamp: number;
}
