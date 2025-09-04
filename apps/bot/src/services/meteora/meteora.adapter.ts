import type { Pool } from "@/types/pool.types";
import type { MeteoraDlmmPool } from "@/types/meteora.types";
import { Token } from "@/types/token.types";
import { JupiterService } from "../jupiter.service";
import { TokenAdapter } from "@/adapters/token.adapter";

export class MeteoraAdapter {
  private jupiterService = new JupiterService();
  private tokenAdapter = new TokenAdapter();

  async transformDlmmPool(apiData: MeteoraDlmmPool): Promise<Pool> {
    const { tokenX, tokenY } = await this.transformToken(apiData);

    return {
      id: apiData.address,
      address: apiData.address,
      name: apiData.name,
      currentPrice: apiData.current_price,
      dex: "meteora",
      type: "DLMM",
      tokenA: tokenX,
      tokenB: tokenY,
      liquidity: apiData.liquidity,
      apr: apiData.apr,
      apy: apiData.apy,
      tvl: apiData.liquidity,
      isVerified: apiData.is_verified,
      volume: {
        hour1: apiData.volume.hour_1,
        hour12: apiData.volume.hour_12,
        hour2: apiData.volume.hour_2,
        hour24: apiData.volume.hour_24,
        hour4: apiData.volume.hour_4,
        min30: apiData.volume.min_30,
      },
      fees: {
        hour1: apiData.fees.hour_1,
        hour12: apiData.fees.hour_12,
        hour2: apiData.fees.hour_2,
        hour24: apiData.fees.hour_24,
        hour4: apiData.fees.hour_4,
        min30: apiData.fees.min_30,
      },
      feeTvlRatio: {
        hour: apiData.fee_tvl_ratio.hour_1,
        hour12: apiData.fee_tvl_ratio.hour_12,
        hour2: apiData.fee_tvl_ratio.hour_2,
        hour24: apiData.fee_tvl_ratio.hour_24,
        hour4: apiData.fee_tvl_ratio.hour_4,
        min30: apiData.fee_tvl_ratio.min_30,
      },
      metadata: {},
    };
  }

  private async transformToken(
    pool: MeteoraDlmmPool
  ): Promise<{ tokenX: Token; tokenY: Token }> {
    const { tokenX, tokenY } = await this.jupiterService.getTokenPairInfo(
      pool.mint_x,
      pool.mint_y
    );
    return {
      tokenX: this.tokenAdapter.transformToken(tokenX),
      tokenY: this.tokenAdapter.transformToken(tokenY),
    };
  }
}
