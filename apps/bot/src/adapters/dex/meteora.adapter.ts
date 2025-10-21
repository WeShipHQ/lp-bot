import { BaseDexAdapter } from "@/adapters/base-dex.adapter";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import {
  CreatePositionParams,
  DexType,
  PaginatedTrendingPools,
  RebalanceParams,
  TransactionResult,
  TrendingParams,
  UnifiedPool,
  UnifiedPosition,
  UrlParseResult,
} from "@/types/core.types";
import { MeteoraApiClient, meteoraApiClient } from "./meteora-api.client";
import { Token } from "@/types/token.types";
import { TokenPriceService, getTokenPriceService } from "@/services/token-price.service";
import { meteoraDlmmService, MeteoraDlmmService } from "@/services/meteora/dlmm.service";
import { PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import { MeteoraDlmmPoolResponse } from "@/types/meteora.types";
import { StrategyType } from "@meteora-ag/dlmm";

/**
 * MeteoraAdapter
 * Implements IDexAdapter for Meteora DLMM pools.
 * - Transforms Meteora API and DLMM SDK responses into UnifiedPool/UnifiedPosition
 * - Builds transactions (create/close/claim/rebalance) via Meteora SDK
 */
export class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter {
  readonly dexType: DexType = "meteora";
  readonly name: string = "Meteora";

  private readonly dlmm: MeteoraDlmmService;
  private readonly api: MeteoraApiClient;
  private readonly prices: TokenPriceService;

  private readonly urlPatterns = {
    dlmm: /^https:\/\/(?:www\.)?meteora\.ag\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
    dammV1: /^https:\/\/(?:www\.)?meteora\.ag\/pools\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
    dammV2: /^https:\/\/(?:www\.)?meteora\.ag\/dammv2\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
  };

  constructor(
    deps?: {
      dlmmService?: MeteoraDlmmService;
      apiClient?: MeteoraApiClient;
      tokenPriceService?: TokenPriceService;
    }
  ) {
    super();
    this.dlmm = deps?.dlmmService ?? meteoraDlmmService;
    this.api = deps?.apiClient ?? meteoraApiClient;
    this.prices = deps?.tokenPriceService ?? (() => { try { return getTokenPriceService(); } catch { return new TokenPriceService(); } })();
  }

  async getPool(poolId: string): Promise<UnifiedPool> {
    try {
      const pool = await this.api.getPool(poolId);
      return this.transformPoolToUnified(pool);
    } catch (error) {
      return this.handleError(error, "getPool");
    }
  }

  async getTrendingPools(params?: TrendingParams): Promise<PaginatedTrendingPools> {
    try {
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 10;
      const sortKey = this.mapSortKey(params?.sortBy);

      const res = await this.api.getTrendingPools({
        page,
        limit,
        sort_key: sortKey,
        order_by: params?.sortOrder ?? "desc",
        include_unknown: !(params?.verified ?? true),
        hide_low_tvl: params?.minTvl ?? 0,
      });

      const pools: UnifiedPool[] = (res.pairs || []).map((p) =>
        this.transformPoolToUnified(p)
      );

      const totalPages = limit > 0 ? Math.ceil((res.total || 0) / limit) : 1;

      return {
        pools,
        currentPage: page,
        totalPages,
        sortBy: params?.sortBy ?? "tvl",
      };
    } catch (error) {
      return this.handleError(error, "getTrendingPools");
    }
  }

  async searchPools(query: string): Promise<UnifiedPool[]> {
    try {
      if (!query || query.trim().length === 0) return [];
      const all = await this.api.getAllPools();
      const lowered = query.toLowerCase();
      const filtered = all.filter((p) =>
        (p.name || "").toLowerCase().includes(lowered) ||
        p.address.toLowerCase().includes(lowered) ||
        p.mint_x.toLowerCase().includes(lowered) ||
        p.mint_y.toLowerCase().includes(lowered)
      );
      return filtered.map((p) => this.transformPoolToUnified(p));
    } catch (error) {
      return this.handleError(error, "searchPools");
    }
  }

  async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
    try {
      const positionsByPool = await this.dlmm.getAllLbPairPositionsByUser(
        userAddress
      );

      const unified: UnifiedPosition[] = [];

      // Collect unique mints for batch price fetch
      const uniqueMints = new Set<string>();
      for (const [, info] of Array.from(positionsByPool)) {
        const xMint = info.lbPair.tokenXMint.toString();
        const yMint = info.lbPair.tokenYMint.toString();
        uniqueMints.add(xMint);
        uniqueMints.add(yMint);
      }
      const priceMap = await this.prices.getPrices(Array.from(uniqueMints));

      for (const [poolAddress, info] of Array.from(positionsByPool)) {
        const xMint = info.lbPair.tokenXMint.toString();
        const yMint = info.lbPair.tokenYMint.toString();

        const xDecimals = Number((info as any).tokenX?.mint?.decimals ?? 0);
        const yDecimals = Number((info as any).tokenY?.mint?.decimals ?? 0);

        const tokenA: Token = {
          address: xMint,
          symbol: (info as any).tokenX?.mint?.symbol || xMint.slice(0, 4),
          name: (info as any).tokenX?.mint?.name || xMint,
          decimals: xDecimals,
        };
        const tokenB: Token = {
          address: yMint,
          symbol: (info as any).tokenY?.mint?.symbol || yMint.slice(0, 4),
          name: (info as any).tokenY?.mint?.name || yMint,
          decimals: yDecimals,
        };

        const activeId = Number(info.lbPair.activeId);
        const binStepBps = Number(info.lbPair.binStep);

        const xPrice = priceMap[xMint]?.price ?? 0;
        const yPrice = priceMap[yMint]?.price ?? 0;

        // SDK exposes lbPairPositionsData at runtime although TS defs omit it
        for (const pos of ((info as any).lbPairPositionsData ?? []) as Array<{
          publicKey: PublicKey;
          version: number;
          positionData: {
            lowerBinId: number;
            upperBinId: number;
            totalXAmount?: string | bigint | number;
            totalYAmount?: string | bigint | number;
            totalXAmountExcludeTransferFee?: string | bigint | number;
            totalYAmountExcludeTransferFee?: string | bigint | number;
            feeX?: string | bigint | number;
            feeY?: string | bigint | number;
            feeXExcludeTransferFee?: string | bigint | number;
            feeYExcludeTransferFee?: string | bigint | number;
            totalClaimedFeeXAmount?: string | bigint | number;
            totalClaimedFeeYAmount?: string | bigint | number;
            lastUpdatedAt?: any;
          };
        }>) {
          const address = pos.publicKey.toString();
          const pd = pos.positionData;

          const totalXRaw = (pd.totalXAmountExcludeTransferFee ?? pd.totalXAmount) as any;
          const totalYRaw = (pd.totalYAmountExcludeTransferFee ?? pd.totalYAmount) as any;

          const tokenAAmount = this.fromRawAmount(totalXRaw, xDecimals).toString();
          const tokenBAmount = this.fromRawAmount(totalYRaw, yDecimals).toString();

          const currentValueUsd =
            this.fromRawAmount(totalXRaw, xDecimals) * xPrice +
            this.fromRawAmount(totalYRaw, yDecimals) * yPrice;

          const lower = Number(pd.lowerBinId);
          const upper = Number(pd.upperBinId);
          const inRange = activeId >= lower && activeId <= upper;

          // Compute fees (unclaimed and claimed) in USD where possible
          const feeXRaw = (pd.feeXExcludeTransferFee ?? pd.feeX) as any;
          const feeYRaw = (pd.feeYExcludeTransferFee ?? pd.feeY) as any;
          const feeX = this.fromRawAmount(feeXRaw, xDecimals);
          const feeY = this.fromRawAmount(feeYRaw, yDecimals);
          const unclaimedFeesUsd = feeX * xPrice + feeY * yPrice;

          const claimedFeeXRaw = (pd.totalClaimedFeeXAmount ?? 0) as any;
          const claimedFeeYRaw = (pd.totalClaimedFeeYAmount ?? 0) as any;
          const claimedFeesUsd =
            this.fromRawAmount(claimedFeeXRaw, xDecimals) * xPrice +
            this.fromRawAmount(claimedFeeYRaw, yDecimals) * yPrice;

          unified.push({
            id: `${poolAddress}-${address}`,
            address,
            poolAddress,
            dex: this.dexType,
            type: "DLMM",
            tokenA,
            tokenB,
            tokenAAmount,
            tokenBAmount,
            currentValueUsd,
            initialValueUsd: currentValueUsd, // Unknown here; set equal for now
            unclaimedFeesUsd,
            claimedFeesUsd,
            unclaimedRewardsUsd: 0,
            claimedRewardsUsd: 0,
            pnlUsd: 0,
            pnlPercentage: 0,
            inRange,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              binStepBps,
              activeId,
              lowerBinId: lower,
              upperBinId: upper,
            },
          });
        }
      }

      return unified;
    } catch (error) {
      return this.handleError(error, "getUserPositions");
    }
  }

  async getPosition(positionAddress: string): Promise<UnifiedPosition> {
    throw new Error("Method not implemented.");
  }

  async createPosition(params: CreatePositionParams): Promise<TransactionResult> {
    try {
      this.validateAddress(params.poolAddress);
      this.validateAddress(params.userAddress);
      this.validateAmount(params.tokenAAmount);
      this.validateAmount(params.tokenBAmount);

      const strategy = this.mapStrategy(params.strategy);
      const rangeInterval = Number(params.metadata?.rangeInterval ?? 10);

      const res = await this.dlmm.buildCreatePositionTx(
        params.poolAddress,
        params.userAddress,
        new Decimal(params.tokenAAmount),
        new Decimal(params.tokenBAmount),
        strategy,
        rangeInterval
      );

      return {
        success: true,
        metadata: {
          instructions: res.instructions,
          positionPublicKey: res.positionPublicKey.toBase58(),
          estimatedFeesLamports: 0,
        },
      };
    } catch (error) {
      return this.handleError(error, "createPosition");
    }
  }

  async closePosition(positionAddress: string): Promise<TransactionResult> {
    try {
      this.validateAddress(positionAddress);
      // Expect caller to provide required context via metadata on the call site
      const ctx = (arguments as any)[1] || {};
      if (!ctx.userAddress || !ctx.poolAddress) {
        throw new Error("Missing userAddress or poolAddress in metadata for closePosition");
      }
      const owner = new PublicKey(ctx.userAddress);
      const pool = new PublicKey(ctx.poolAddress);

      const res = await this.dlmm.buildClosePositionTx(
        owner,
        pool,
        new PublicKey(positionAddress)
      );

      return {
        success: true,
        metadata: {
          instructions: res.instructions,
        },
      };
    } catch (error) {
      return this.handleError(error, "closePosition");
    }
  }

  async claimFees(positionAddress: string): Promise<TransactionResult> {
    try {
      this.validateAddress(positionAddress);
      const ctx = (arguments as any)[1] || {};
      if (!ctx.userAddress || !ctx.poolAddress) {
        throw new Error("Missing userAddress or poolAddress in metadata for claimFees");
      }
      const owner = new PublicKey(ctx.userAddress);
      const pool = new PublicKey(ctx.poolAddress);

      const res = await this.dlmm.buildClaimFeesTx(
        owner,
        pool,
        new PublicKey(positionAddress)
      );

      return {
        success: true,
        metadata: {
          instructions: res.instructions,
        },
      };
    } catch (error) {
      return this.handleError(error, "claimFees");
    }
  }

  async rebalancePosition(
    positionAddress: string,
    params: RebalanceParams
  ): Promise<TransactionResult> {
    try {
      const md = params.metadata || {};
      const userAddress = new PublicKey(String((md as any).userAddress));
      const poolAddress = new PublicKey(String((md as any).poolAddress));
      const newXA = String((md as any).tokenAAmount || "0");
      const newYA = String((md as any).tokenBAmount || "0");
      const strategy = (md as any).strategy as any;
      const rangeInterval = Number((md as any).rangeInterval ?? 10);

      const closeRes = await this.dlmm.buildClosePositionTx(
        userAddress,
        poolAddress,
        new PublicKey(positionAddress)
      );

      const createRes = await this.dlmm.buildCreatePositionTx(
        poolAddress,
        userAddress,
        new Decimal(newXA),
        new Decimal(newYA),
        strategy,
        rangeInterval
      );

      return {
        success: true,
        metadata: {
          close: { instructions: closeRes.instructions },
          create: { instructions: createRes.instructions, positionPublicKey: createRes.positionPublicKey.toBase58() },
        },
      };
    } catch (error) {
      return this.handleError(error, "rebalancePosition");
    }
  }

  parsePoolUrl(url: string): UrlParseResult | null {
    const trimmed = url.trim();

    const dlmmMatch = trimmed.match(this.urlPatterns.dlmm);
    if (dlmmMatch) {
      return {
        dex: "meteora",
        poolId: dlmmMatch[1],
        poolType: "DLMM",
      };
    }

    const dammV1Match = trimmed.match(this.urlPatterns.dammV1);
    if (dammV1Match) {
      return {
        dex: "meteora",
        poolId: dammV1Match[1],
        poolType: "DAMM",
      };
    }

    const dammV2Match = trimmed.match(this.urlPatterns.dammV2);
    if (dammV2Match) {
      return {
        dex: "meteora",
        poolId: dammV2Match[1],
        poolType: "DAMM",
      };
    }

    return null;
  }

  private transformPoolToUnified(p: MeteoraDlmmPoolResponse): UnifiedPool {
    const [symA, symB] = (p.name || "").split("-").map((s) => s?.trim().toUpperCase());

    const tokenA: Token = {
      address: p.mint_x,
      symbol: symA || p.mint_x.slice(0, 4),
      name: symA || p.mint_x,
      decimals: 6,
    };

    const tokenB: Token = {
      address: p.mint_y,
      symbol: symB || p.mint_y.slice(0, 4),
      name: symB || p.mint_y,
      decimals: 6,
    };

    const volume24h = Number(p.trade_volume_24h ?? 0);
    const fees24h = Number(p.fees_24h ?? 0);
    const feeTvlRatio24h = (typeof (p as any).fee_tvl_ratio === "object"
      ? Number((p as any).fee_tvl_ratio?.hour_24 ?? 0)
      : Number((p as any).fee_tvl_ratio ?? 0)) as number;

    return {
      id: p.address,
      address: p.address,
      name: p.name,
      dex: this.dexType,
      type: "DLMM",
      tokenA,
      tokenB,
      liquidity: String(p.liquidity ?? "0"),
      tvl: String(p.liquidity ?? "0"),
      apr: Number((p as any).apr ?? 0),
      apy: Number((p as any).apy ?? (p as any).apr ?? 0),
      currentPrice: Number((p as any).current_price ?? 0),
      isVerified: !!(p as any).is_verified,
      volume24h,
      fees24h,
      feeTvlRatio24h,
      volume: {
        hour1: Number((p.volume as any)?.hour_1 ?? 0),
        hour4: Number((p.volume as any)?.hour_4 ?? 0),
        hour12: Number((p.volume as any)?.hour_12 ?? 0),
        hour24: Number((p.volume as any)?.hour_24 ?? 0),
      },
      fees: {
        hour1: Number((p.fees as any)?.hour_1 ?? 0),
        hour4: Number((p.fees as any)?.hour_4 ?? 0),
        hour12: Number((p.fees as any)?.hour_12 ?? 0),
        hour24: Number((p.fees as any)?.hour_24 ?? 0),
      },
      metadata: {
        base_fee_percentage: (p as any).base_fee_percentage,
        bin_step: (p as any).bin_step,
        farm_apr: (p as any).farm_apr,
        farm_apy: (p as any).farm_apy,
        launchpad: (p as any).launchpad,
        max_fee_percentage: (p as any).max_fee_percentage,
        protocol_fee_percentage: (p as any).protocol_fee_percentage,
        reserve_x: (p as any).reserve_x,
        reserve_y: (p as any).reserve_y,
        tags: (p as any).tags,
      },
    };
  }

  private fromRawAmount(raw?: string | bigint | number, decimals = 0): number {
    const v = raw == null ? 0 : Number(raw.toString());
    return v / Math.pow(10, decimals || 0);
  }

  private mapSortKey(sortBy?: TrendingParams["sortBy"]): DlmmSortKey {
    switch (sortBy) {
      case "fee_tvl_ratio":
        return "feetvlratio";
      case "volume24h":
        return "volume";
      case "tvl":
        return "tvl";
      case "apy":
      default:
        return "tvl"; // APY not supported by API sort, fallback to TVL
    }
  }

  private mapStrategy(strategy?: string): StrategyType {
    const s = (strategy || "spot").toLowerCase();
    switch (s) {
      case "spot":
        return StrategyType.Spot as unknown as StrategyType;
      case "curve":
        return StrategyType.Curve as unknown as StrategyType;
      case "bid-ask":
      case "bidask":
        return StrategyType.BidAsk as unknown as StrategyType;
      default:
        return StrategyType.Spot as unknown as StrategyType;
    }
  }
}

type DlmmSortKey =
  | "tvl"
  | "volume"
  | "feetvlratio"
  | "lm"
  | "feetvlratio30m"
  | "feetvlratio1h"
  | "feetvlratio2h"
  | "feetvlratio4h"
  | "feetvlratio12h"
  | "volume30m"
  | "volume1h"
  | "volume2h"
  | "volume4h"
  | "volume12h";
