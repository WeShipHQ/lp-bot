// import { PoolDex } from "./pool.types";

// export interface Token {
//   address: string;
//   symbol: string;
//   name: string;
//   decimals: number;
//   logoUri?: string;
// }

// export interface TokenInfo extends Token {
//   price: number;
//   priceChange24h: number;
//   marketCap: number;
//   volume24h: number;
//   liquidity: number;
//   isVerified: boolean;
//   source: "jupiter" | "meteora";
// }

// export interface TokenPrice {
//   id: string;
//   timestamp: number;
//   price: number;
//   blockId: number;
//   decimals: number;
//   priceChange24h: number;
// }

// export interface TokenDisplayData {
//   token: TokenInfo;
//   poolInfo?: MeteoraPoolData;
//   error?: string;
// }

// export type TokenInputType = "address" | "pool" | "start_param";

// export type PoolType = "damm_v1" | "damm_v2" | "dlmm";

// export interface TokenInputDetection {
//   type: TokenInputType;
//   value: string; // token address or pool id
//   originalInput: string;
//   dex?: PoolDex;
//   poolType?: PoolType;
// }
