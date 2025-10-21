import { api } from "@/utils/http-client.util";
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
