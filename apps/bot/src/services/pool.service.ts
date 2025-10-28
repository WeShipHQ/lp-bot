import type { MeteoraPoolData, MeteoraPoolType } from "@/types/meteora.types";
import { meteoraPoolService } from "./meteora/pool.service";
import { TokenAdapter } from "@/adapters/token.adapter";
import { Pool, PoolDex } from "@/types/pool.types";
import { MeteoraAdapter } from "@/adapters/dex/meteora.adapter";
import { MeteoraApiClient, meteoraApiClient } from "@/adapters/dex/meteora";
import { SarosPoolService } from "./saros/pool.service";
import { SarosAdapter } from "./saros/saros.adapter";

export class PoolService {
  private readonly meteoraApiClient: MeteoraApiClient;
  private readonly sarosPoolService = new SarosPoolService();
  private readonly tokenAdapter = new TokenAdapter();
  private readonly meteoraAdapter = new MeteoraAdapter();
  // private sarosAdapter = new SarosAdapter();

  constructor(meteoraClient: MeteoraApiClient = meteoraApiClient) {
    this.meteoraApiClient = meteoraClient;
  }

  async findPoolsForToken(tokenAddress: string): Promise<MeteoraPoolData[]> {
    try {
      console.log(`[PoolDiscovery] Finding pools for token: ${tokenAddress}`);

      // Mock implementation - in real implementation, you would:
      // 1. Query Jupiter API for pools containing this token
      // 2. Filter for Meteora pools
      // 3. Get detailed pool information from Meteora APIs
      // 4. Sort by liquidity, volume, and fees

      const mockPools: MeteoraPoolData[] = [
        {
          pool_address: "7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5",
          pool_name: `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}-USDC`,
          creator: "meteora",
          token_a_mint: tokenAddress,
          token_b_mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
          token_a_vault: "",
          token_b_vault: "",
          token_a_symbol: "TOKEN",
          token_b_symbol: "USDC",
          alpha_vault: "",
          sqrt_min_price: "0",
          sqrt_max_price: "0",
          min_price: "0",
          max_price: "0",
          liquidity: "1000000",
          permanent_lock_liquidity: "0",
          sqrt_price: 1.0,
          token_a_amount: 500000,
          token_b_amount: 500000,
          token_a_amount_usd: 500000,
          token_b_amount_usd: 500000,
          pool_price: 1.0,
          virtual_price: 1.0,
          pool_type: 2,
          created_at_slot: Date.now(),
          created_at_slot_timestamp: Date.now() / 1000,
          updated_at: Date.now(),
          tvl: 1000000,
          apr: 15.5,
          fee_tvl_ratio: 0.02,
          fee24h: 2000,
          volume24h: 100000,
          base_fee: 0.003,
          dynamic_fee: 0.001,
          fee_scheduler_mode: 1,
          collect_fee_mode: 1,
          launchpad: null,
          tokens_verified: true,
          has_farm: true,
          farm_active: true,
        },
        {
          pool_address: "8YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G6",
          pool_name: `${tokenAddress.slice(0, 4)}...${tokenAddress.slice(-4)}-SOL`,
          creator: "meteora",
          token_a_mint: tokenAddress,
          token_b_mint: "So11111111111111111111111111111111111111112", // SOL
          token_a_vault: "",
          token_b_vault: "",
          token_a_symbol: "TOKEN",
          token_b_symbol: "SOL",
          alpha_vault: "",
          sqrt_min_price: "0",
          sqrt_max_price: "0",
          min_price: "0",
          max_price: "0",
          liquidity: "750000",
          permanent_lock_liquidity: "0",
          sqrt_price: 1.0,
          token_a_amount: 375000,
          token_b_amount: 375000,
          token_a_amount_usd: 375000,
          token_b_amount_usd: 375000,
          pool_price: 1.0,
          virtual_price: 1.0,
          pool_type: 3,
          created_at_slot: Date.now(),
          created_at_slot_timestamp: Date.now() / 1000,
          updated_at: Date.now(),
          tvl: 750000,
          apr: 12.3,
          fee_tvl_ratio: 0.015,
          fee24h: 1500,
          volume24h: 75000,
          base_fee: 0.0025,
          dynamic_fee: 0.0015,
          fee_scheduler_mode: 1,
          collect_fee_mode: 1,
          launchpad: null,
          tokens_verified: true,
          has_farm: false,
          farm_active: false,
        },
      ];

      // Sort by TVL descending
      return mockPools.sort((a, b) => b.tvl - a.tvl);
    } catch (error) {
      console.error(
        `[PoolDiscovery] Error finding pools for token ${tokenAddress}:`,
        error
      );
      return [];
    }
  }

  async getBestPoolForToken(
    tokenAddress: string
  ): Promise<MeteoraPoolData | null> {
    const pools = await this.findPoolsForToken(tokenAddress);
    return pools.length > 0 ? pools[0] : null;
  }

  async getPool(poolAddress: string, poolType: MeteoraPoolType) {
    try {
      const pool = await meteoraPoolService.getPoolInfo(poolAddress, poolType);

      return pool;
    } catch (error) {
      console.error(
        `[Meteora] Error fetching pool ${poolAddress} with type ${poolType}:`,
        error
      );
      return null;
    }
  }

  async getPoolV2(
    poolAddress: string,
    dex: PoolDex = "meteora"
  ): Promise<Pool> {
    // // for now we mainly support DLMM so we only fetch DLMM pool
    // if (dex === "saros") {
    //   const dlmmPool = await this.sarosPoolService.getDlmmPool(poolAddress);
    //   return SarosAdapter.dlmmPoolDetailToPool(dlmmPool.data);
    // }
    // const dlmmPool = await this.meteoraApiClient.getPool(poolAddress);
    // return this.meteoraAdapter.transformDlmmPool(dlmmPool);

    throw new Error(`Unsupported DEX: ${dex}`);
  }
}

export const poolService = new PoolService();
