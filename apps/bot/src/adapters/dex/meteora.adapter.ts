import { BaseDexAdapter } from "@/adapters/base-dex.adapter";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import {
  CreatePositionResult,
  CreatePositionParams,
  DexType,
  PaginatedTrendingPools,
  TrendingParams,
  UnifiedPool,
  UnifiedPosition,
  UrlParseResult,
  ClosePositionResult,
  ClosePositionParams,
  ClaimFeesParams,
  ClaimFeesResult,
  Token,
} from "@/types/core.types";
import {
  MeteoraApiClient,
  meteoraApiClient,
  MeteoraTransformers,
  meteoraTransformers,
} from "./meteora";
import { TokenPriceService } from "@/services/token-price.service";
import { meteoraDlmmService, MeteoraDlmmService } from "@/adapters/dex/meteora";
import { Keypair, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";
import { StrategyType } from "@meteora-ag/dlmm";
import { DEFAULT_BIN_RANGE } from "@/domain";
import { JupiterService } from "@/services/jupiter.service";
import {
  assertNever,
  strategyRegistry,
  toMeteoraStrategyType,
} from "@/domain/strategies";

export class MeteoraAdapter extends BaseDexAdapter implements IDexAdapter {
  readonly dexType: DexType = "meteora";
  readonly name: string = "Meteora";

  private readonly dlmm: MeteoraDlmmService;
  private readonly api: MeteoraApiClient;
  private readonly transformers: MeteoraTransformers;
  private readonly jupiterService: JupiterService;

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
    jupiterService: JupiterService;
  }) {
    super();
    this.dlmm = deps?.dlmmService ?? meteoraDlmmService;
    this.api = deps?.apiClient ?? meteoraApiClient;
    this.transformers = deps?.transformers ?? meteoraTransformers;
    this.jupiterService = new JupiterService();
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
      const positionsByPool = await this.dlmm.getUserPositions(userAddress);

      const unified: UnifiedPosition[] = [];

      // Collect unique mints for batch price fetch
      const uniqueMints = new Set<string>();
      for (const [, info] of Array.from(positionsByPool)) {
        const xMint = info.lbPair.tokenXMint.toString();
        const yMint = info.lbPair.tokenYMint.toString();
        uniqueMints.add(xMint);
        uniqueMints.add(yMint);
      }
      // const priceMap = await this.prices.getPrices(Array.from(uniqueMints));

      const tokens = await this.jupiterService.searchTokens(
        Array.from(uniqueMints).join(",")
      );

      for (const [poolAddress, info] of Array.from(positionsByPool)) {
        const xMint = info.lbPair.tokenXMint.toBase58();
        const yMint = info.lbPair.tokenYMint.toBase58();

        const tokenA: Token = tokens.find((token) => token.address === xMint)!;
        const tokenB: Token = tokens.find((token) => token.address === yMint)!;

        const activeId = Number(info.lbPair.activeId);
        const binStepBps = Number(info.lbPair.binStep);

        for (const pos of info.lbPairPositionsData ?? []) {
          const address = pos.publicKey.toBase58();
          const pd = pos.positionData;

          const unifiedPosition = this.transformers.onChainToUnifiedPosition({
            poolAddress,
            positionAddress: address,
            tokenA,
            tokenB,
            positionData: pd,
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
    poolAddress: string
  ): Promise<UnifiedPosition> {
    try {
      return await this.getPositionForPool(positionAddress, poolAddress);
    } catch (error) {
      return this.handleError(error, "getPosition");
    }
  }

  async getUserPosition(
    userAddress: string,
    positionAddress: string
  ): Promise<UnifiedPosition> {
    try {
      return this.getPositionForUser(positionAddress, userAddress);
    } catch (error) {
      return this.handleError(error, "getPosition");
    }
  }

  private async getPositionForUser(
    positionAddress: string,
    userAddress: string
  ): Promise<UnifiedPosition> {
    const positionInfoMap = await this.dlmm.getUserPositions(userAddress);
    const positionInfos = Array.from(positionInfoMap.values());
    const positionInfo = positionInfos.find((info) =>
      info.lbPairPositionsData.find(
        (pos) => pos.publicKey.toBase58() === positionAddress
      )
    );

    if (!positionInfo) {
      throw new Error("Position not found");
    }

    const lbPair = positionInfo.lbPair;

    const { tokenX, tokenY } = await this.jupiterService.getTokenPairInfo(
      positionInfo.tokenX.mint.address.toBase58(),
      positionInfo.tokenY.mint.address.toBase58()
    );

    return this.transformers.onChainToUnifiedPosition({
      poolAddress: positionInfo.publicKey.toBase58(),
      positionAddress,
      tokenA: tokenX,
      tokenB: tokenY,
      positionData:
        positionInfo.lbPairPositionsData.find(
          (pos) => pos.publicKey.toBase58() === positionAddress
        )?.positionData ?? {},
      lbPairInfo: {
        activeId: Number(lbPair.activeId ?? 0),
        binStep: Number(lbPair.binStep ?? 0),
      },
      metadataExtras: { userAddress },
    });
  }

  private async getPositionForPool(
    positionAddress: string,
    poolAddress: string
  ): Promise<UnifiedPosition> {
    const { lbPair, lbPosition, lowerBinPrice, upperBinPrice } =
      await this.dlmm.getPositionOnChain(positionAddress, poolAddress);
    if (!lbPosition) {
      throw new Error("Position not found");
    }

    const { tokenX, tokenY } = await this.jupiterService.getTokenPairInfo(
      lbPair.tokenXMint.toString(),
      lbPair.tokenYMint.toString()
    );

    return this.transformers.onChainToUnifiedPosition({
      poolAddress,
      positionAddress,
      tokenA: tokenX,
      tokenB: tokenY,
      positionData: lbPosition.positionData ?? {},
      lbPairInfo: {
        activeId: Number(lbPair.activeId ?? 0),
        binStep: Number(lbPair.binStep ?? 0),
      },
      metadataExtras: {
        lbVersion: lbPosition.version,
        lowerBinPrice,
        upperBinPrice,
      },
    });
  }

  async createPositionIxs(
    params: CreatePositionParams
  ): Promise<CreatePositionResult> {
    try {
      // Use strategy registry to get strategy and convert to Meteora type
      const lpStrategy = strategyRegistry.getOrDefault(params.strategy);
      
      // Validate that the strategy supports this DEX
      if (!lpStrategy.supportsDex(this.dexType)) {
        throw new Error(
          `Strategy "${lpStrategy.metadata.name}" does not support ${this.dexType}`
        );
      }

      // Convert strategy name to Meteora SDK type
      const meteoraStrategyType = toMeteoraStrategyType(
        lpStrategy.metadata.name
      );
      const strategy = this.mapStrategyToSDK(meteoraStrategyType);
      
      const rangeInterval = Number(params?.rangeInterval ?? lpStrategy.metadata.defaultRangeInterval);
      const positionKp = Keypair.generate();

      const res = await this.dlmm.buildCreatePositionIxs(
        positionKp.publicKey,
        new PublicKey(params.poolAddress),
        new PublicKey(params.userAddress),
        new Decimal(params.tokenAAmount),
        new Decimal(params.tokenBAmount),
        strategy,
        rangeInterval
      );

      return {
        success: true,
        instructions: res.instructions,
        positionKp: positionKp,
      };
    } catch (error) {
      console.log("createPositionIx failed", { error, params });
      return this.handleError(error, "createPosition");
    }
  }

  /**
   * V2 method: Builds a complete position creation transaction with preview data.
   * Returns a VersionedTransaction ready for signing and submission.
   * 
   * This method supports:
   * - Strategy-based bin range calculation
   * - Optional SOL auto-convert via Jupiter
   * - Compute budget optimization
   * - Preview data for UI display
   * 
   * @param params - Position creation parameters with optional SOL conversion
   * @returns TransactionResult with transaction, signers, and preview metadata
   */
  async createPosition(
    params: CreatePositionParams & {
      solAutoConvert?: {
        solAmount: number;
        jupiterQuotes?: {
          tokenX: {
            inputAmount: string;
            outputAmount: string;
            swapInstructions: any[];
          };
          tokenY: {
            inputAmount: string;
            outputAmount: string;
            swapInstructions: any[];
          };
        };
      };
      priorityFee?: number;
    }
  ): Promise<import("@/types/core.types").TransactionResult> {
    try {
      // Use strategy registry to get strategy and convert to Meteora type
      const lpStrategy = strategyRegistry.getOrDefault(params.strategy);
      
      // Validate that the strategy supports this DEX
      if (!lpStrategy.supportsDex(this.dexType)) {
        throw new Error(
          `Strategy "${lpStrategy.metadata.name}" does not support ${this.dexType}`
        );
      }

      // Convert strategy name to Meteora SDK type
      const meteoraStrategyType = toMeteoraStrategyType(
        lpStrategy.metadata.name
      );
      const strategy = this.mapStrategyToSDK(meteoraStrategyType);
      
      const rangeInterval = Number(params?.rangeInterval ?? lpStrategy.metadata.defaultRangeInterval);

      // Call the new transaction builder
      const result = await this.dlmm.buildCreatePositionTransaction({
        poolAddress: params.poolAddress,
        userPublicKey: new PublicKey(params.userAddress),
        tokenXAmount: new Decimal(params.tokenAAmount),
        tokenYAmount: new Decimal(params.tokenBAmount),
        strategy,
        rangeInterval,
        solAutoConvert: params.solAutoConvert,
        slippage: params.slippage,
        priorityFee: params.priorityFee,
      });

      return result;
    } catch (error) {
      console.log("createPosition failed", { error, params });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Create position failed",
      };
    }
  }

  async closePositionIxs(
    params: ClosePositionParams
  ): Promise<ClosePositionResult> {
    try {
      if (!params.userAddress || !params.poolAddress) {
        throw new Error(
          "Missing userAddress or poolAddress in metadata for closePosition"
        );
      }
      const owner = new PublicKey(params.userAddress);
      const pool = new PublicKey(params.poolAddress);

      const res = await this.dlmm.buildClosePositionIxs(
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

  async claimFeesIxs(params: ClaimFeesParams): Promise<ClaimFeesResult> {
    try {
      const owner = new PublicKey(params.userAddress);
      const pool = new PublicKey(params.poolAddress);

      const res = await this.dlmm.buildClaimFeesIxs(
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

  async getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: Decimal;
    toPrice: Decimal;
    activeBinId: number;
    fromBinId: number;
    toBinId: number;
  }> {
    try {
      const pool = new PublicKey(poolAddress);
      const res = await this.dlmm.calculatePriceRange(pool, rangeInterval);

      return {
        fromPrice: new Decimal(res.fromPrice),
        toPrice: new Decimal(res.toPrice),
        activeBinId: res.activeBinId,
        fromBinId: res.fromBinId,
        toBinId: res.toBinId,
      };
    } catch (error) {
      return this.handleError(error, "getPriceRange");
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

  /**
   * @deprecated Use strategyRegistry and toMeteoraStrategyType instead
   * Kept for backward compatibility
   */
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

  /**
   * Map string strategy type to Meteora SDK StrategyType enum
   */
  private mapStrategyToSDK(strategyType: "Spot" | "Curve" | "BidAsk"): StrategyType {
    switch (strategyType) {
      case "Spot":
        return StrategyType.Spot as unknown as StrategyType;
      case "Curve":
        return StrategyType.Curve as unknown as StrategyType;
      case "BidAsk":
        return StrategyType.BidAsk as unknown as StrategyType;
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
