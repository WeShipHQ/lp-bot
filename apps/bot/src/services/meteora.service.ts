import {
  MeteoraPoolData,
  DlmmPoolResponse,
  DammV1PoolResponse,
  DammV2PoolResponse,
} from "../types/token.types";

/**
 * Service for interacting with Meteora APIs
 */
export class MeteoraService {
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";

  /**
   * Fetch DLMM pool information
   * @param poolId - Pool address
   * @returns Promise<MeteoraPoolData | null>
   */
  async getDlmmPoolInfo(poolId: string): Promise<MeteoraPoolData | null> {
    try {
      console.log(`[Meteora] Fetching DLMM pool: ${poolId}`);

      const response = await this.fetchWithRetry(
        `${this.dlmmApiUrl}/pair/${poolId}`
      );

      if (!response.ok) {
        console.error(
          `[Meteora] DLMM API error: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data: DlmmPoolResponse = await response.json();

      return this.mapDlmmToMeteoraPoolData(data);
    } catch (error) {
      console.error(`[Meteora] Error fetching DLMM pool ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Fetch DAMM v1 pool information
   * @param poolId - Pool address
   * @returns Promise<MeteoraPoolData | null>
   */
  async getDammV1PoolInfo(poolId: string): Promise<MeteoraPoolData | null> {
    try {
      console.log(`[Meteora] Fetching DAMM v1 pool: ${poolId}`);

      const url = `${this.dammV1ApiUrl}/pools?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`;
      const response = await this.fetchWithRetry(url);

      if (!response.ok) {
        console.error(
          `[Meteora] DAMM v1 API error: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data: DammV1PoolResponse[] = await response.json();

      if (!data || data.length === 0) {
        console.error(`[Meteora] No DAMM v1 pool found for address: ${poolId}`);
        return null;
      }

      return this.mapDammV1ToMeteoraPoolData(data[0]);
    } catch (error) {
      console.error(`[Meteora] Error fetching DAMM v1 pool ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Fetch DAMM v2 pool information
   * @param poolId - Pool address
   * @returns Promise<MeteoraPoolData | null>
   */
  async getDammV2PoolInfo(poolId: string): Promise<MeteoraPoolData | null> {
    try {
      console.log(`[Meteora] Fetching DAMM v2 pool: ${poolId}`);

      const response = await this.fetchWithRetry(
        `${this.dammV2ApiUrl}/pools/${poolId}`
      );

      if (!response.ok) {
        console.error(
          `[Meteora] DAMM v2 API error: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data: DammV2PoolResponse = await response.json();

      if (data.status !== 200) {
        console.error(`[Meteora] DAMM v2 API returned status: ${data.status}`);
        return null;
      }

      console.log("data", data);

      return this.mapDammV2ToMeteoraPoolData(data.data);
    } catch (error) {
      console.error(`[Meteora] Error fetching DAMM v2 pool ${poolId}:`, error);
      return null;
    }
  }

  /**
   * Get pool information based on pool type
   * @param poolId - Pool address
   * @param poolType - Type of pool
   * @returns Promise<MeteoraPoolData | null>
   */
  async getPoolInfo(
    poolId: string,
    poolType: "damm_v1" | "damm_v2" | "dlmm"
  ): Promise<MeteoraPoolData | null> {
    switch (poolType) {
      case "damm_v1":
        return this.getDammV1PoolInfo(poolId);
      case "damm_v2":
        return this.getDammV2PoolInfo(poolId);
      case "dlmm":
        return this.getDlmmPoolInfo(poolId);
      default:
        throw new Error(`Unknown pool type: ${poolType}`);
    }
  }

  /**
   * Validate if a pool exists
   * @param poolId - Pool address
   * @returns Promise<boolean>
   */
  async validatePool(poolId: string): Promise<boolean> {
    try {
      // Try each pool type to see if the pool exists
      const dlmmPool = await this.getDlmmPoolInfo(poolId);
      if (dlmmPool) return true;

      const dammV1Pool = await this.getDammV1PoolInfo(poolId);
      if (dammV1Pool) return true;

      const dammV2Pool = await this.getDammV2PoolInfo(poolId);
      if (dammV2Pool) return true;

      return false;
    } catch (error) {
      console.error(`[Meteora] Error validating pool ${poolId}:`, error);
      return false;
    }
  }

  /**
   * Map DLMM response to MeteoraPoolData
   */
  private mapDlmmToMeteoraPoolData(data: DlmmPoolResponse): MeteoraPoolData {
    return {
      pool_address: data.address,
      pool_name: data.name,
      creator: "", // Not available in DLMM response
      token_a_mint: data.mint_x,
      token_b_mint: data.mint_y,
      token_a_vault: data.reserve_x,
      token_b_vault: data.reserve_y,
      token_a_symbol: data.name.split("-")[0] || "TOKEN_A",
      token_b_symbol: data.name.split("-")[1] || "TOKEN_B",
      alpha_vault: "", // Not available in DLMM response
      sqrt_min_price: "0",
      sqrt_max_price: "0",
      min_price: "0",
      max_price: "0",
      liquidity: data.liquidity,
      permanent_lock_liquidity: "0",
      sqrt_price: Math.sqrt(data.current_price),
      token_a_amount: data.reserve_x_amount,
      token_b_amount: data.reserve_y_amount,
      token_a_amount_usd: data.reserve_x_amount * data.current_price,
      token_b_amount_usd: data.reserve_y_amount,
      pool_price: data.current_price,
      virtual_price: 0,
      pool_type: 3, // DLMM type
      created_at_slot: 0,
      created_at_slot_timestamp: 0,
      updated_at: Date.now(),
      tvl: data.reserve_x_amount * data.current_price + data.reserve_y_amount,
      apr: data.apr,
      fee_tvl_ratio: data.fee_tvl_ratio.hour_24,
      fee24h: data.fees_24h,
      volume24h: data.trade_volume_24h,
      base_fee: parseFloat(data.base_fee_percentage),
      dynamic_fee: 0,
      fee_scheduler_mode: 0,
      collect_fee_mode: 0,
      launchpad: data.launchpad,
      tokens_verified: data.is_verified,
      has_farm: data.farm_apr > 0,
      farm_active: data.farm_apr > 0,
    };
  }

  /**
   * Map DAMM v1 response to MeteoraPoolData
   */
  private mapDammV1ToMeteoraPoolData(
    data: DammV1PoolResponse
  ): MeteoraPoolData {
    const tokenSymbols = data.pool_name.split("-");

    return {
      pool_address: data.pool_address,
      pool_name: data.pool_name,
      creator: "", // Not available in DAMM v1 response
      token_a_mint: data.pool_token_mints[0] || "",
      token_b_mint: data.pool_token_mints[1] || "",
      token_a_vault: "", // Not available in DAMM v1 response
      token_b_vault: "", // Not available in DAMM v1 response
      token_a_symbol: tokenSymbols[0] || "TOKEN_A",
      token_b_symbol: tokenSymbols[1] || "TOKEN_B",
      alpha_vault: "", // Not available in DAMM v1 response
      sqrt_min_price: "0",
      sqrt_max_price: "0",
      min_price: "0",
      max_price: "0",
      liquidity: "0",
      permanent_lock_liquidity: "0",
      sqrt_price: 0,
      token_a_amount: parseFloat(data.pool_token_amounts[0] || "0"),
      token_b_amount: parseFloat(data.pool_token_amounts[1] || "0"),
      token_a_amount_usd: parseFloat(data.pool_token_usd_amounts[0] || "0"),
      token_b_amount_usd: parseFloat(data.pool_token_usd_amounts[1] || "0"),
      pool_price: 0,
      virtual_price: 0,
      pool_type: 1, // DAMM v1 type
      created_at_slot: data.created_at,
      created_at_slot_timestamp: data.created_at,
      updated_at: Date.now(),
      tvl: parseFloat(data.pool_tvl),
      apr: parseFloat(data.trade_apy || "0"),
      fee_tvl_ratio: 0,
      fee24h: data.fee_volume,
      volume24h: data.trading_volume,
      base_fee: parseFloat(data.total_fee_pct || "0"),
      dynamic_fee: 0,
      fee_scheduler_mode: 0,
      collect_fee_mode: 0,
      launchpad: null,
      tokens_verified: true,
      has_farm: data.farming_pool !== "",
      farm_active: data.farming_pool !== "" && !data.farm_expire,
    };
  }

  /**
   * Map DAMM v2 response to MeteoraPoolData
   */
  private mapDammV2ToMeteoraPoolData(
    data: DammV2PoolResponse["data"]
  ): MeteoraPoolData {
    return {
      pool_address: data.pool_address,
      pool_name: data.pool_name,
      creator: data.creator,
      token_a_mint: data.token_a_mint,
      token_b_mint: data.token_b_mint,
      token_a_vault: data.token_a_vault,
      token_b_vault: data.token_b_vault,
      token_a_symbol: data.token_a_symbol,
      token_b_symbol: data.token_b_symbol,
      alpha_vault: data.alpha_vault,
      sqrt_min_price: data.sqrt_min_price,
      sqrt_max_price: data.sqrt_max_price,
      min_price: data.min_price,
      max_price: data.max_price,
      liquidity: data.liquidity,
      permanent_lock_liquidity: data.permanent_lock_liquidity,
      sqrt_price: data.sqrt_price,
      token_a_amount: data.token_a_amount,
      token_b_amount: data.token_b_amount,
      token_a_amount_usd: data.token_a_amount_usd,
      token_b_amount_usd: data.token_b_amount_usd,
      pool_price: data.pool_price,
      virtual_price: data.virtual_price,
      pool_type: data.pool_type,
      created_at_slot: data.created_at_slot,
      created_at_slot_timestamp: data.created_at_slot_timestamp,
      updated_at: data.updated_at,
      tvl: data.tvl,
      apr: data.apr,
      fee_tvl_ratio: data.fee_tvl_ratio,
      fee24h: data.fee24h,
      volume24h: data.volume24h,
      base_fee: data.base_fee,
      dynamic_fee: data.dynamic_fee,
      fee_scheduler_mode: data.fee_scheduler_mode,
      collect_fee_mode: data.collect_fee_mode,
      launchpad: data.launchpad,
      tokens_verified: data.tokens_verified,
      has_farm: data.has_farm,
      farm_active: data.farm_active,
    };
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    retries = this.maxRetries
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok || response.status === 404) {
          return response;
        }

        if (i === retries - 1) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        await this.delay(this.retryDelay * Math.pow(2, i));
      } catch (error) {
        if (i === retries - 1) {
          throw error;
        }
        await this.delay(this.retryDelay * Math.pow(2, i));
      }
    }

    throw new Error("Max retries exceeded");
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const meteoraService = new MeteoraService();
