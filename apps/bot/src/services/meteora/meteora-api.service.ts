import { api } from "@/utils/http-client.util";
import {
  MeteoraDlmmPoolResponse,
  MeteoraDammV1PoolResponse,
  MeteoraDammV2PoolResponse,
} from "@/types/meteora.types";
import { CircuitBreaker } from "@/infrastructure/resilience/circuit-breaker";
import { getCacheService } from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";

export class MeteoraApiService {
  private readonly dlmmApiUrl = "https://dlmm-api.meteora.ag";
  private readonly dammV1ApiUrl = "https://damm-api.meteora.ag";
  private readonly dammV2ApiUrl = "https://dammv2-api.meteora.ag";
  private readonly breaker = new CircuitBreaker({
    name: "meteora",
    failureThreshold: 5,
    successThreshold: 2,
    timeoutMs: 15000,
  });
  private readonly cache = getCacheService();

  async getDlmmPool(poolAddress: string): Promise<MeteoraDlmmPoolResponse> {
    try {
      console.log(`[Meteora] Fetching DLMM pool: ${poolAddress}`);

      const data = await this.breaker.execute(
        () =>
          api.getWithRetry<MeteoraDlmmPoolResponse>(
            `${this.dlmmApiUrl}/pair/${poolAddress}`
          ),
        async () => {
          const cached = await this.cache.get<MeteoraDlmmPoolResponse>(
            CacheKeys.poolKey("meteora", poolAddress)
          );
          if (!cached) throw new Error("Meteora DLMM API unavailable");
          return cached;
        }
      );

      // Cache fresh result
      await this.cache.set(CacheKeys.poolKey("meteora", poolAddress), data, 60);
      return data;
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM pool ${poolAddress}:`,
        error
      );
      throw error;
    }
  }

  async getDammV1Pool(poolId: string): Promise<MeteoraDammV1PoolResponse> {
    try {
      console.log(`[Meteora] Fetching DAMM v1 pool: ${poolId}`);

      const url = `${this.dammV1ApiUrl}/pools?address=${poolId}&unknown=true&pool_type=dynamic&is_monitoring=true`;
      const arr = await this.breaker.execute(
        () => api.getWithRetry<MeteoraDammV1PoolResponse[]>(url),
        async () => []
      );

      return arr[0] as any;
    } catch (error) {
      console.error(`[Meteora] Error fetching DAMM v1 pool ${poolId}:`, error);
      throw error;
    }
  }

  async getDammV2Pool(poolId: string): Promise<MeteoraDammV2PoolResponse> {
    try {
      console.log(`[Meteora] Fetching DAMM v2 pool: ${poolId}`);

      const data = await this.breaker.execute(
        () =>
          api.getWithRetry<MeteoraDammV2PoolResponse>(
            `${this.dammV2ApiUrl}/pools/${poolId}`
          ),
        async () => ({}) as any
      );

      return data as any;
    } catch (error) {
      console.error(`[Meteora] Error fetching DAMM v2 pool ${poolId}:`, error);
      throw error;
    }
  }

  // async getPositionClaimFees(positionAddress: string): Promise<DlmmClaimFee[]> {
  //   try {
  //     const url = `${this.dlmmApiUrl}/position/${positionAddress}/claim_fees`;
  //     const data = await api.getWithRetry<DlmmClaimFee[]>(url);
  //     return Array.isArray(data) ? data : [];
  //   } catch (error: any) {
  //     if (error.status === 404) return [];
  //     throw error;
  //   }
  // }

  // async getPositionClaimRewards(
  //   positionAddress: string
  // ): Promise<DlmmClaimReward[]> {
  //   try {
  //     const url = `${this.dlmmApiUrl}/position/${positionAddress}/claim_rewards`;
  //     const data = await api.getWithRetry<DlmmClaimReward[]>(url);
  //     return Array.isArray(data) ? data : [];
  //   } catch (error: any) {
  //     if (error.status === 404) return [];
  //     throw error;
  //   }
  // }

  // async getPositionDeposits(
  //   positionAddress: string
  // ): Promise<DlmmDepositWithdraw[]> {
  //   try {
  //     const url = `${this.dlmmApiUrl}/position/${positionAddress}/deposits`;
  //     const data = await api.getWithRetry<DlmmDepositWithdraw[]>(url);
  //     return Array.isArray(data) ? data : [];
  //   } catch (error: any) {
  //     if (error.status === 404) return [];
  //     throw error;
  //   }
  // }

  // async getPositionWithdraws(
  //   positionAddress: string
  // ): Promise<DlmmDepositWithdraw[]> {
  //   try {
  //     const url = `${this.dlmmApiUrl}/position/${positionAddress}/withdraws`;
  //     const data = await api.getWithRetry<DlmmDepositWithdraw[]>(url);
  //     return Array.isArray(data) ? data : [];
  //   } catch (error: any) {
  //     if (error.status === 404) return [];
  //     throw error;
  //   }
  // }

  // /**
  //  * Fetch all DLMM pools with pagination
  //  * @param params - Query parameters for pagination and filtering
  //  * @returns Promise<MeteoraDlmmPoolsPaginationResponse>
  //  */
  // async getAllDlmmPools(
  //   params: DlmmPoolsPaginationParams = {}
  // ): Promise<MeteoraDlmmPoolsPaginationResponse> {
  //   try {
  //     console.log(`[Meteora] Fetching all DLMM pools with params:`, params);

  //     // Build query string
  //     const queryParams = new URLSearchParams();

  //     if (params.page !== undefined)
  //       queryParams.append("page", params.page.toString());
  //     if (params.limit !== undefined)
  //       queryParams.append("limit", params.limit.toString());
  //     if (params.skip_size !== undefined)
  //       queryParams.append("skip_size", params.skip_size.toString());
  //     if (params.pools_to_top) {
  //       params.pools_to_top.forEach((pool) =>
  //         queryParams.append("pools_to_top", pool)
  //       );
  //     }
  //     if (params.sort_key) queryParams.append("sort_key", params.sort_key);
  //     if (params.order_by) queryParams.append("order_by", params.order_by);
  //     if (params.search_term)
  //       queryParams.append("search_term", params.search_term);
  //     if (params.include_unknown !== undefined)
  //       queryParams.append(
  //         "include_unknown",
  //         params.include_unknown.toString()
  //       );
  //     if (params.hide_low_tvl !== undefined)
  //       queryParams.append("hide_low_tvl", params.hide_low_tvl.toString());
  //     if (params.hide_low_apr !== undefined)
  //       queryParams.append("hide_low_apr", params.hide_low_apr.toString());
  //     if (params.include_token_mints) {
  //       params.include_token_mints.forEach((mint) =>
  //         queryParams.append("include_token_mints", mint)
  //       );
  //     }
  //     if (params.include_pool_token_pairs) {
  //       params.include_pool_token_pairs.forEach((pair) =>
  //         queryParams.append("include_pool_token_pairs", pair)
  //       );
  //     }
  //     if (params.tags) {
  //       params.tags.forEach((tag) => queryParams.append("tags", tag));
  //     }
  //     if (params.launchpad) {
  //       params.launchpad.forEach((lp) => queryParams.append("launchpad", lp));
  //     }

  //     const url = `${this.dlmmApiUrl}/pair/all_with_pagination${queryParams.toString() ? "?" + queryParams.toString() : ""}`;

  //     const data =
  //       await api.getWithRetry<MeteoraDlmmPoolsPaginationResponse>(url);

  //     return data;
  //   } catch (error) {
  //     console.error(`[Meteora] Error fetching all DLMM pools:`, error);
  //     throw error;
  //   }
  // }
}

// export function mapDlmmToMeteoraPoolData(
//   data: MeteoraDlmmPoolResponse
// ): MeteoraPoolData {
//   return {
//     pool_address: data.address,
//     pool_name: data.name,
//     creator: "", // Not available in DLMM response
//     token_a_mint: data.mint_x,
//     token_b_mint: data.mint_y,
//     token_a_vault: data.reserve_x,
//     token_b_vault: data.reserve_y,
//     token_a_symbol: data.name.split("-")[0] || "TOKEN_A",
//     token_b_symbol: data.name.split("-")[1] || "TOKEN_B",
//     alpha_vault: "", // Not available in DLMM response
//     sqrt_min_price: "0",
//     sqrt_max_price: "0",
//     min_price: "0",
//     max_price: "0",
//     liquidity: data.liquidity,
//     permanent_lock_liquidity: "0",
//     sqrt_price: Math.sqrt(data.current_price),
//     token_a_amount: data.reserve_x_amount,
//     token_b_amount: data.reserve_y_amount,
//     token_a_amount_usd: data.reserve_x_amount * data.current_price,
//     token_b_amount_usd: data.reserve_y_amount,
//     pool_price: data.current_price,
//     virtual_price: 0,
//     pool_type: 3, // DLMM type
//     created_at_slot: 0,
//     created_at_slot_timestamp: 0,
//     updated_at: Date.now(),
//     tvl: data.reserve_x_amount * data.current_price + data.reserve_y_amount,
//     apr: data.apr,
//     fee_tvl_ratio: data.fee_tvl_ratio.hour_24,
//     fee24h: data.fees_24h,
//     volume24h: data.trade_volume_24h,
//     base_fee: parseFloat(data.base_fee_percentage),
//     dynamic_fee: 0,
//     fee_scheduler_mode: 0,
//     collect_fee_mode: 0,
//     launchpad: data.launchpad,
//     tokens_verified: data.is_verified,
//     has_farm: data.farm_apr > 0,
//     farm_active: data.farm_apr > 0,
//   };
// }

// export function mapDammV1ToMeteoraPoolData(
//   data: MeteoraDammV1PoolResponse
// ): MeteoraPoolData {
//   const tokenSymbols = data.pool_name.split("-");

//   return {
//     pool_address: data.pool_address,
//     pool_name: data.pool_name,
//     creator: "", // Not available in DAMM v1 response
//     token_a_mint: data.pool_token_mints[0] || "",
//     token_b_mint: data.pool_token_mints[1] || "",
//     token_a_vault: "", // Not available in DAMM v1 response
//     token_b_vault: "", // Not available in DAMM v1 response
//     token_a_symbol: tokenSymbols[0] || "TOKEN_A",
//     token_b_symbol: tokenSymbols[1] || "TOKEN_B",
//     alpha_vault: "", // Not available in DAMM v1 response
//     sqrt_min_price: "0",
//     sqrt_max_price: "0",
//     min_price: "0",
//     max_price: "0",
//     liquidity: "0",
//     permanent_lock_liquidity: "0",
//     sqrt_price: 0,
//     token_a_amount: parseFloat(data.pool_token_amounts[0] || "0"),
//     token_b_amount: parseFloat(data.pool_token_amounts[1] || "0"),
//     token_a_amount_usd: parseFloat(data.pool_token_usd_amounts[0] || "0"),
//     token_b_amount_usd: parseFloat(data.pool_token_usd_amounts[1] || "0"),
//     pool_price: 0,
//     virtual_price: 0,
//     pool_type: 1, // DAMM v1 type
//     created_at_slot: data.created_at,
//     created_at_slot_timestamp: data.created_at,
//     updated_at: Date.now(),
//     tvl: parseFloat(data.pool_tvl),
//     apr: parseFloat(data.trade_apy || "0"),
//     fee_tvl_ratio: 0,
//     fee24h: data.fee_volume,
//     volume24h: data.trading_volume,
//     base_fee: parseFloat(data.total_fee_pct || "0"),
//     dynamic_fee: 0,
//     fee_scheduler_mode: 0,
//     collect_fee_mode: 0,
//     launchpad: null,
//     tokens_verified: true,
//     has_farm: data.farming_pool !== "",
//     farm_active: data.farming_pool !== "" && !data.farm_expire,
//   };
// }

// export function mapDammV2ToMeteoraPoolData(
//   data: MeteoraDammV2PoolResponse["data"]
// ): MeteoraPoolData {
//   return {
//     pool_address: data.pool_address,
//     pool_name: data.pool_name,
//     creator: data.creator,
//     token_a_mint: data.token_a_mint,
//     token_b_mint: data.token_b_mint,
//     token_a_vault: data.token_a_vault,
//     token_b_vault: data.token_b_vault,
//     token_a_symbol: data.token_a_symbol,
//     token_b_symbol: data.token_b_symbol,
//     alpha_vault: data.alpha_vault,
//     sqrt_min_price: data.sqrt_min_price,
//     sqrt_max_price: data.sqrt_max_price,
//     min_price: data.min_price,
//     max_price: data.max_price,
//     liquidity: data.liquidity,
//     permanent_lock_liquidity: data.permanent_lock_liquidity,
//     sqrt_price: data.sqrt_price,
//     token_a_amount: data.token_a_amount,
//     token_b_amount: data.token_b_amount,
//     token_a_amount_usd: data.token_a_amount_usd,
//     token_b_amount_usd: data.token_b_amount_usd,
//     pool_price: data.pool_price,
//     virtual_price: data.virtual_price,
//     pool_type: data.pool_type,
//     created_at_slot: data.created_at_slot,
//     created_at_slot_timestamp: data.created_at_slot_timestamp,
//     updated_at: data.updated_at,
//     tvl: data.tvl,
//     apr: data.apr,
//     fee_tvl_ratio: data.fee_tvl_ratio,
//     fee24h: data.fee24h,
//     volume24h: data.volume24h,
//     base_fee: data.base_fee,
//     dynamic_fee: data.dynamic_fee,
//     fee_scheduler_mode: data.fee_scheduler_mode,
//     collect_fee_mode: data.collect_fee_mode,
//     launchpad: data.launchpad,
//     tokens_verified: data.tokens_verified,
//     has_farm: data.has_farm,
//     farm_active: data.farm_active,
//   };
// }
