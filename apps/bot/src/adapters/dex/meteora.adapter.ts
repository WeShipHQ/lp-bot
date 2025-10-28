import { BaseDexAdapter } from "@/adapters/base-dex.adapter";
import { IDexAdapter, PositionContext } from "@/types/dex-adapter.interface";
import {
  CreatePositionResult,
  CreatePositionParams,
  DexType,
  PaginatedTrendingPools,
  RebalanceParams,
  TransactionResult,
  TrendingParams,
  UnifiedPool,
  UnifiedPosition,
  UrlParseResult,
  ClosePositionResult,
  ClosePositionParams,
  ClaimFeesParams,
  ClaimFeesResult,
} from "@/types/core.types";
import {
  MeteoraApiClient,
  meteoraApiClient,
  MeteoraTransformers,
  meteoraTransformers,
} from "./meteora";
import { Token } from "@/types/token.types";
import {
  TokenPriceService,
  getTokenPriceService,
} from "@/services/token-price.service";
import {
  meteoraDlmmService,
  MeteoraDlmmService,
} from "@/adapters/dex/meteora";
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
  private readonly transformers: MeteoraTransformers;
  private readonly prices: TokenPriceService;

  private readonly urlPatterns = {
    dlmm: /^https:\/\/(?:www\.)?meteora\.ag\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
    dammV1:
      /^https:\/\/(?:www\.)?meteora\.ag\/pools\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
    dammV2:
      /^https:\/\/(?:www\.)?meteora\.ag\/dammv2\/([1-9A-HJ-NP-Za-km-z]{32,44})(?:\?.*)?$/,
  };

  constructor(deps?: {
    dlmmService?: MeteoraDlmmService;
    apiClient?: MeteoraApiClient;
    transformers?: MeteoraTransformers;
    tokenPriceService?: TokenPriceService;
  }) {
    super();
    this.dlmm = deps?.dlmmService ?? meteoraDlmmService;
    this.api = deps?.apiClient ?? meteoraApiClient;
    this.transformers = deps?.transformers ?? meteoraTransformers;
    this.prices =
      deps?.tokenPriceService ??
      (() => {
        try {
          return getTokenPriceService();
        } catch {
          return new TokenPriceService();
        }
      })();
  }

  async getPool(poolId: string): Promise<UnifiedPool> {
    try {
      const pool = await this.api.getPool(poolId);
      return this.transformers.toUnifiedPool(pool);
    } catch (error) {
      return this.handleError(error, "getPool");
    }
  }

  async getTrendingPools(
    params?: TrendingParams
  ): Promise<PaginatedTrendingPools> {
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

      const pools: UnifiedPool[] = await Promise.all(
        (res.pairs || []).map((p) => this.transformers.toUnifiedPool(p))
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
      const filtered = all.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(lowered) ||
          p.address.toLowerCase().includes(lowered) ||
          p.mint_x.toLowerCase().includes(lowered) ||
          p.mint_y.toLowerCase().includes(lowered)
      );

      return await Promise.all(
        filtered.map((p) => this.transformers.toUnifiedPool(p))
      );
    } catch (error) {
      return this.handleError(error, "searchPools");
    }
  }

  async getUserPositions(userAddress: string): Promise<UnifiedPosition[]> {
    try {
      const positionsByPool =
        await this.dlmm.getAllLbPairPositionsByUser(userAddress);

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

        const tokenA: Token = this.transformers.transformToken({
          id: xMint,
          symbol:
            (info as any).tokenX?.mint?.symbol ??
            (info as any).tokenX?.symbol ??
            xMint.slice(0, 4),
          name:
            (info as any).tokenX?.mint?.name ??
            (info as any).tokenX?.name ??
            xMint,
          decimals: xDecimals,
          icon:
            (info as any).tokenX?.mint?.icon ??
            (info as any).tokenX?.icon ??
            (info as any).tokenX?.logoUri,
        });
        const tokenB: Token = this.transformers.transformToken({
          id: yMint,
          symbol:
            (info as any).tokenY?.mint?.symbol ??
            (info as any).tokenY?.symbol ??
            yMint.slice(0, 4),
          name:
            (info as any).tokenY?.mint?.name ??
            (info as any).tokenY?.name ??
            yMint,
          decimals: yDecimals,
          icon:
            (info as any).tokenY?.mint?.icon ??
            (info as any).tokenY?.icon ??
            (info as any).tokenY?.logoUri,
        });

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

          const unifiedPosition = this.transformers.onChainToUnifiedPosition({
            poolAddress,
            positionAddress: address,
            tokenA,
            tokenB,
            positionData: pd,
            priceMap,
            lbPairInfo: {
              activeId,
              binStep: binStepBps,
            },
          });

          unified.push(unifiedPosition);
        }
      }

      return unified;
    } catch (error) {
      return this.handleError(error, "getUserPositions");
    }
  }

  async getPosition(
    positionAddress: string,
    context?: PositionContext
  ): Promise<UnifiedPosition> {
    try {
      this.validateAddress(positionAddress);
      const userAddress = context?.userAddress;
      const poolAddress = context?.poolAddress;

      console.log({ positionAddress, userAddress, poolAddress });

      if (userAddress) {
        return await this.getPositionForUser(positionAddress, userAddress);
      }

      if (poolAddress) {
        this.validateAddress(poolAddress);
        return await this.getPositionForPool(
          positionAddress,
          poolAddress,
          context?.userAddress
        );
      }

      throw new Error(
        "userAddress or poolAddress is required to fetch position details from Meteora"
      );
    } catch (error) {
      return this.handleError(error, "getPosition");
    }
  }

  private async getPositionForUser(
    positionAddress: string,
    userAddress: string
  ): Promise<UnifiedPosition> {
    const positionsByPool =
      await this.dlmm.getAllLbPairPositionsByUser(userAddress);

    for (const [poolAddress, info] of Array.from(positionsByPool.entries())) {
      const positionsData = ((info as any).lbPairPositionsData ?? []) as Array<{
        publicKey: PublicKey;
        positionData: any;
      }>;

      const matched = positionsData.find(
        (pos) => pos.publicKey.toString() === positionAddress
      );

      if (!matched) {
        continue;
      }

      const xMint = info.lbPair.tokenXMint.toString();
      const yMint = info.lbPair.tokenYMint.toString();

      const xDecimals = Number(
        (info as any).tokenX?.mint?.decimals ??
          (info as any).tokenX?.decimals ??
          6
      );
      const yDecimals = Number(
        (info as any).tokenY?.mint?.decimals ??
          (info as any).tokenY?.decimals ??
          6
      );

      const prices = await this.prices.getPrices([xMint, yMint]);

      const tokenA: Token = this.transformers.transformToken({
        id: xMint,
        symbol:
          (info as any).tokenX?.mint?.symbol ??
          (info as any).tokenX?.symbol ??
          xMint.slice(0, 4),
        name:
          (info as any).tokenX?.mint?.name ??
          (info as any).tokenX?.name ??
          xMint,
        decimals: xDecimals,
        icon:
          (info as any).tokenX?.mint?.icon ??
          (info as any).tokenX?.icon ??
          (info as any).tokenX?.logoUri,
      });

      const tokenB: Token = this.transformers.transformToken({
        id: yMint,
        symbol:
          (info as any).tokenY?.mint?.symbol ??
          (info as any).tokenY?.symbol ??
          yMint.slice(0, 4),
        name:
          (info as any).tokenY?.mint?.name ??
          (info as any).tokenY?.name ??
          yMint,
        decimals: yDecimals,
        icon:
          (info as any).tokenY?.mint?.icon ??
          (info as any).tokenY?.icon ??
          (info as any).tokenY?.logoUri,
      });

      return this.transformers.onChainToUnifiedPosition({
        poolAddress,
        positionAddress,
        tokenA,
        tokenB,
        positionData: matched.positionData ?? {},
        priceMap: prices,
        lbPairInfo: {
          activeId: Number(info.lbPair.activeId ?? 0),
          binStep: Number(info.lbPair.binStep ?? 0),
        },
        metadataExtras: { userAddress },
      });
    }

    throw new Error("Position not found for provided user");
  }

  private async getPositionForPool(
    positionAddress: string,
    poolAddress: string,
    userAddress?: string
  ): Promise<UnifiedPosition> {
    const { lbPair, lbPosition } = await this.dlmm.getPosition(
      positionAddress,
      poolAddress
    );
    if (!lbPosition) {
      throw new Error("Position not found");
    }

    const pool = await this.api.getPool(poolAddress);
    const [symA, symB] = (pool?.name || "")
      .split("-")
      .map((s) => (s ? s.trim().toUpperCase() : undefined));

    const xMint = lbPair.tokenXMint.toString();
    const yMint = lbPair.tokenYMint.toString();

    const tokenA: Token = this.transformers.transformToken({
      id: xMint,
      symbol: symA || xMint.slice(0, 4),
      name: symA || xMint,
      decimals: 6,
    });

    const tokenB: Token = this.transformers.transformToken({
      id: yMint,
      symbol: symB || yMint.slice(0, 4),
      name: symB || yMint,
      decimals: 6,
    });

    const prices = await this.prices.getPrices([xMint, yMint]);

    return this.transformers.onChainToUnifiedPosition({
      poolAddress,
      positionAddress,
      tokenA,
      tokenB,
      positionData: lbPosition.positionData ?? {},
      priceMap: prices,
      lbPairInfo: {
        activeId: Number(lbPair.activeId ?? 0),
        binStep: Number(lbPair.binStep ?? 0),
      },
      metadataExtras: {
        userAddress,
        lbVersion: lbPosition.version,
      },
    });
  }

  async createPosition(
    params: CreatePositionParams
  ): Promise<TransactionResult> {
    try {
      this.validateAddress(params.poolAddress);
      this.validateAddress(params.userAddress);
      // this.validateAmount(params.tokenAAmount);
      // this.validateAmount(params.tokenBAmount);

      const strategy = this.mapStrategy(params.strategy);
      const rangeInterval = Number(params?.rangeInterval ?? 10);

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
          positionKp: res.positionKp,
          estimatedFeesLamports: 0,
        },
      };
    } catch (error) {
      return this.handleError(error, "createPosition");
    }
  }

  async createPositionIx(
    params: CreatePositionParams
  ): Promise<CreatePositionResult> {
    try {
      this.validateAddress(params.poolAddress);
      this.validateAddress(params.userAddress);

      const strategy = this.mapStrategy(params.strategy);
      const rangeInterval = Number(params?.rangeInterval ?? 10);

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
        instructions: res.instructions,
        positionKp: res.positionKp,
      };
    } catch (error) {
      console.log("createPositionIx failed", { error, params });
      return this.handleError(error, "createPosition");
    }
  }

  async closePosition(positionAddress: string): Promise<TransactionResult> {
    try {
      this.validateAddress(positionAddress);
      // Expect caller to provide required context via metadata on the call site
      // @ts-expect-error
      const ctx = (arguments as any)[1] || {};
      if (!ctx.userAddress || !ctx.poolAddress) {
        throw new Error(
          "Missing userAddress or poolAddress in metadata for closePosition"
        );
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

  async closePositionIx(
    params: ClosePositionParams
  ): Promise<ClosePositionResult> {
    try {
      this.validateAddress(params.poolAddress);
      this.validateAddress(params.userAddress);
      this.validateAddress(params.positionAddress);

      if (!params.userAddress || !params.poolAddress) {
        throw new Error(
          "Missing userAddress or poolAddress in metadata for closePosition"
        );
      }
      const owner = new PublicKey(params.userAddress);
      const pool = new PublicKey(params.poolAddress);

      const res = await this.dlmm.buildClosePositionTx(
        owner,
        pool,
        new PublicKey(params.positionAddress)
      );

      return {
        success: true,
        instructions: res.instructions,
      };
    } catch (error) {
      return this.handleError(error, "closePosition");
    }
  }

  async claimFeesIx(params: ClaimFeesParams): Promise<ClaimFeesResult> {
    try {
      this.validateAddress(params.poolAddress);
      this.validateAddress(params.positionAddress);
      this.validateAddress(params.userAddress);

      const owner = new PublicKey(params.userAddress);
      const pool = new PublicKey(params.poolAddress);

      const res = await this.dlmm.buildClaimFeesTx(
        owner,
        pool,
        new PublicKey(params.positionAddress)
      );

      return {
        success: true,
        instructions: res.instructions,
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
          create: {
            instructions: createRes.instructions,
            positionKp: createRes.positionKp,
          },
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
