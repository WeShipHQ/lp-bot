import { api } from "@/bot/utils/http-client.util";
import {
  SarosBaseListResponse,
  SarosDlmmPool,
  SarosDlmmPoolsFilterParams,
  SarosDlmmPoolDetail,
  SarosBaseResponse,
} from "./types";

export class SarosPoolService {
  private readonly dlmmApiUrl = "https://api.saros.xyz/api/dex-v3";

  async getDlmmPool(
    poolAddress: string
  ): Promise<SarosBaseResponse<SarosDlmmPoolDetail>> {
    try {
      console.log(`[Saros] Fetching DLMM pool: ${poolAddress}`);

      const data = await api.getWithRetry<
        SarosBaseResponse<SarosDlmmPoolDetail>
      >(`${this.dlmmApiUrl}/pool/${poolAddress}`);

      return data;
    } catch (error) {
      console.error(`[Saros] Error fetching DLMM pool ${poolAddress}:`, error);
      throw error;
    }
  }

  async getAllDlmmPools(
    params: SarosDlmmPoolsFilterParams = {}
  ): Promise<SarosBaseListResponse<SarosDlmmPool>> {
    try {
      console.log(`[Saros] Fetching all DLMM pools with params:`, params);

      const queryParams = new URLSearchParams();

      if (params.page !== undefined) {
        queryParams.append("page", params.page.toString());
      }

      if (params.size !== undefined) {
        queryParams.append("size", params.size.toString());
      }

      if (params.orderBy && params.order) {
        const orderPrefix = params.order === "asc" ? "+" : "-";
        queryParams.append("order", `${orderPrefix}${params.orderBy}`);
      } else if (params.orderBy) {
        queryParams.append("order", `-${params.orderBy}`);
      }

      const baseUrl = `${this.dlmmApiUrl}/pool`;
      const url = queryParams.toString()
        ? `${baseUrl}?${queryParams.toString()}`
        : baseUrl;

      const data =
        await api.getWithRetry<SarosBaseListResponse<SarosDlmmPool>>(url);

      return data;
    } catch (error) {
      console.error(`[Saros] Error fetching all DLMM pools:`, error);
      throw error;
    }
  }
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
