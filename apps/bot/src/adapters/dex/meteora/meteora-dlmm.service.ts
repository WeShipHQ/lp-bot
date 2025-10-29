import DLMM, {
  getPriceOfBinByBinId,
  StrategyType,
  PositionInfo,
  LbPosition,
} from "@meteora-ag/dlmm";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG } from "@/config";
import Decimal from "decimal.js";
import { LbPair } from "@/types/meteora.types";

/**
 * Calculation result for deposit amounts required for position creation
 */
export interface DepositAmountCalculation {
  tokenXAmount: BN;
  tokenYAmount: BN;
  tokenXSymbol: string;
  tokenYSymbol: string;
  tokenXDecimals: number;
  tokenYDecimals: number;
  totalValueInSOL: number;
  pricePerToken: number;
  strategy: {
    minBinId: number;
    maxBinId: number;
    activeBinId: number;
    rangeInterval: number;
  };
}

/**
 * Parsed position data from DLMM SDK
 */
export interface ParsedPositionData {
  positionAddress: string;
  poolAddress: string;
  lowerBinId: number;
  upperBinId: number;
  tokenXAmount: string;
  tokenYAmount: string;
  feeX: string;
  feeY: string;
  rewardOne: string;
  rewardTwo: string;
  totalXAmount: string;
  totalYAmount: string;
  positionBinData: Array<{
    binId: number;
    positionXAmount: string;
    positionYAmount: string;
  }>;
}

/**
 * Parsed on-chain pool state data
 */
export interface ParsedPoolData {
  poolAddress: string;
  tokenX: {
    mint: string;
    reserve: string;
    decimals: number;
  };
  tokenY: {
    mint: string;
    reserve: string;
    decimals: number;
  };
  activeBinId: number;
  binStep: number;
  baseFeeRate: string;
  protocolFeeRate: string;
  currentPrice: string;
}

export class MeteoraDlmmService {
  private poolCache = new Map<string, { instance: DLMM; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

  /**
   * Creates or retrieves a cached DLMM pool instance.
   * Instances are cached for 30 seconds to reduce RPC calls.
   *
   * @param poolAddress - The pool's public key or base58 address
   * @returns DLMM SDK instance for the specified pool
   * @private
   */
  private async createInstance(poolAddress: string | PublicKey): Promise<DLMM> {
    const poolKey =
      typeof poolAddress === "string" ? poolAddress : poolAddress.toBase58();
    const now = Date.now();

    const cached = this.poolCache.get(poolKey);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.instance;
    }

    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
    // @ts-ignore
    const instance = await DLMM.default.create(
      connection,
      new PublicKey(poolAddress)
    );

    this.poolCache.set(poolKey, { instance, timestamp: now });

    return instance;
  }

  /**
   * Creates position initialization transaction with pre-generated position keypair.
   * Internal method used by the SDK integration.
   *
   * @param positionAddress - Pre-generated position keypair public key
   * @param poolAddress - The pool's public key
   * @param userPublicKey - The user's wallet public key
   * @param totalXAmount - Token X amount as Decimal
   * @param totalYAmount - Token Y amount as Decimal
   * @param strategy - Position strategy type
   * @param rangeInterval - Price range interval in bins
   * @returns Transaction instructions (without position keypair)
   * @private
   */
  async buildCreatePositionIxs(
    positionAddress: PublicKey,
    poolAddress: PublicKey,
    userPublicKey: PublicKey,
    totalXAmount: Decimal,
    totalYAmount: Decimal,
    strategy: StrategyType,
    rangeInterval: number
  ): Promise<{
    instructions: TransactionInstruction[];
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const activeBin = await dlmmPool.getActiveBin();

    const minBinId = activeBin.binId - rangeInterval;
    const maxBinId = activeBin.binId + rangeInterval;

    if (totalXAmount.isZero() && totalYAmount.isZero()) {
      throw new Error("Invalid amount");
    }

    console.log(
      `[DLMM] Final amounts - X: ${totalXAmount.toString()}, Y: ${totalYAmount.toString()}`
    );

    const createPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionAddress,
        user: userPublicKey,
        totalXAmount: new BN(totalXAmount.toString()),
        totalYAmount: new BN(totalYAmount.toString()),
        strategy: {
          maxBinId,
          minBinId,
          strategyType: strategy,
        },
      });

    return {
      instructions: createPositionTx.instructions,
    };
  }

  /**
   * Builds transaction instructions to close a position.
   * Removes all liquidity and claims fees atomically.
   * Internal method - delegates to DLMM SDK.
   *
   * @param ownerAddress - The position owner's public key
   * @param poolAddress - The pool's public key
   * @param positionAddress - The position's public key
   * @returns Transaction instructions for closing
   * @private
   */
  async buildClosePositionIxs(
    ownerAddress: PublicKey,
    poolAddress: PublicKey,
    positionAddress: PublicKey
  ): Promise<{
    instructions: TransactionInstruction[];
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const position = await dlmmPool.getPosition(positionAddress);

    if (!position) {
      throw new Error("Position not found");
    }

    const binIdsToRemove = position.positionData.positionBinData.map(
      (bin) => bin.binId
    );

    const removeLiquidityTx = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user: ownerAddress,
      fromBinId: binIdsToRemove[0],
      toBinId: binIdsToRemove[binIdsToRemove.length - 1],
      bps: new BN(100 * 100), // 100% (range from 0 to 100)
      shouldClaimAndClose: true, // should claim swap fee and close position together
    });

    return {
      instructions: removeLiquidityTx.flatMap((tx) => tx.instructions),
    };
  }

  /**
   * Builds transaction instructions to claim fees from a position.
   * Internal method - delegates to DLMM SDK.
   *
   * @param ownerAddress - The position owner's public key
   * @param poolAddress - The pool's public key
   * @param positionAddress - The position's public key
   * @returns Transaction instructions for claiming fees
   * @private
   */
  async buildClaimFeesIxs(
    ownerAddress: PublicKey,
    poolAddress: PublicKey,
    positionAddress: PublicKey
  ): Promise<{
    instructions: TransactionInstruction[];
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const position = await dlmmPool.getPosition(positionAddress);

    if (!position) {
      throw new Error("Position not found");
    }

    const claimFeeTxs = await dlmmPool.claimSwapFee({
      owner: ownerAddress,
      position,
    });

    return {
      instructions: claimFeeTxs.flatMap((tx) => tx.instructions),
    };
  }

  /**
   * Gets all positions for a user.
   * Alias for getAllLbPairPositionsByUser.
   *
   * @param userAddress - The user's wallet public key or base58 address
   * @returns Map of position addresses to PositionInfo from DLMM SDK
   */
  async getUserPositions(
    walletAddress: string | PublicKey
  ): Promise<Map<string, PositionInfo>> {
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

    // @ts-expect-error - DLMM SDK has incorrect TypeScript definitions
    return DLMM.default.getAllLbPairPositionsByUser(
      connection,
      typeof walletAddress === "string"
        ? new PublicKey(walletAddress)
        : walletAddress
    );
  }

  /**
   * Retrieves a specific position and its associated pool data.
   *
   * @param positionAddress - The position's public key or base58 address
   * @param poolAddress - The pool's public key or base58 address
   * @returns Position and pool pair data from DLMM SDK
   */
  async getPositionOnChain(
    positionAddress: string | PublicKey,
    poolAddress: string | PublicKey
  ): Promise<{
    lbPair: LbPair;
    lbPosition: LbPosition;
    lowerBinPrice: string;
    upperBinPrice: string;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const lbPosition = await dlmmPool.getPosition(
      typeof positionAddress === "string"
        ? new PublicKey(positionAddress)
        : positionAddress
    );

    const lowerBinPrice = getPriceOfBinByBinId(
      lbPosition.positionData.lowerBinId,
      dlmmPool.lbPair.binStep
    );

    const upperBinPrice = getPriceOfBinByBinId(
      lbPosition.positionData.upperBinId,
      dlmmPool.lbPair.binStep
    );

    return {
      lbPair: dlmmPool.lbPair,
      lbPosition,
      lowerBinPrice: dlmmPool.fromPricePerLamport(lowerBinPrice.toNumber()),
      upperBinPrice: dlmmPool.fromPricePerLamport(upperBinPrice.toNumber()),
    };
  }

  /**
   * Analyzes if a position is within its price range.
   * Calculates the distance from the active bin to position boundaries.
   *
   * @param poolAddress - The pool's public key or base58 address
   * @param positionAddress - The position's public key or base58 address
   * @returns Position range analysis including in-range status and distances
   */
  async analyzePositionInRange(
    poolAddress: string | PublicKey,
    positionAddress: string | PublicKey
  ): Promise<{
    isInRange: boolean;
    activeBinId: number;
    positionLowerBinId: number;
    positionUpperBinId: number;
    distanceFromActive: number;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const activeBin = await dlmmPool.getActiveBin();

    const position = await dlmmPool.getPosition(
      typeof positionAddress === "string"
        ? new PublicKey(positionAddress)
        : positionAddress
    );

    if (!position) {
      throw new Error("Position not found");
    }

    const positionData = position.positionData;
    const lowerBinId = positionData.lowerBinId;
    const upperBinId = positionData.upperBinId;
    const activeBinId = activeBin.binId;

    const isInRange = activeBinId >= lowerBinId && activeBinId <= upperBinId;

    const distanceFromActive = Math.min(
      Math.abs(activeBinId - lowerBinId),
      Math.abs(activeBinId - upperBinId)
    );

    return {
      isInRange,
      activeBinId,
      positionLowerBinId: lowerBinId,
      positionUpperBinId: upperBinId,
      distanceFromActive,
    };
  }

  // ============================================
  // Pool On-Chain Operations
  // ============================================

  /**
   * Fetches pool state directly from the blockchain using DLMM SDK.
   *
   * @param poolAddress - The pool's public key or base58 address
   * @returns Parsed on-chain pool data
   */
  async getPoolOnChain(
    poolAddress: string | PublicKey
  ): Promise<ParsedPoolData> {
    const dlmmPool = await this.createInstance(poolAddress);
    const activeBin = await dlmmPool.getActiveBin();

    return {
      poolAddress:
        typeof poolAddress === "string" ? poolAddress : poolAddress.toBase58(),
      tokenX: {
        mint: dlmmPool.lbPair.tokenXMint.toBase58(),
        reserve: dlmmPool.lbPair.reserveX.toString(),
        decimals: dlmmPool.tokenX.mint.decimals,
      },
      tokenY: {
        mint: dlmmPool.lbPair.tokenYMint.toBase58(),
        reserve: dlmmPool.lbPair.reserveY.toString(),
        decimals: dlmmPool.tokenY.mint.decimals,
      },
      activeBinId: activeBin.binId,
      binStep: dlmmPool.lbPair.binStep,
      baseFeeRate: "0", // dlmmPool.lbPair.baseFeeRate?.toString() ?? "0",
      protocolFeeRate: dlmmPool.lbPair.protocolFee?.toString() ?? "0",
      currentPrice: activeBin.price.toString(),
    };
  }

  /**
   * Parses position data from DLMM SDK into a standardized format.
   * Extracts token amounts, fees, rewards, and bin distribution.
   *
   * @param positionAddress - The position's public key or base58 address
   * @param poolAddress - The pool's public key or base58 address
   * @returns Parsed position data with all relevant fields
   */
  async parsePositionData(
    positionAddress: string | PublicKey,
    poolAddress: string | PublicKey
  ): Promise<ParsedPositionData> {
    const { lbPair, lbPosition } = await this.getPositionOnChain(
      positionAddress,
      poolAddress
    );

    if (!lbPosition) {
      throw new Error(
        `Position not found: ${typeof positionAddress === "string" ? positionAddress : positionAddress.toBase58()}`
      );
    }

    const positionData = lbPosition.positionData;

    return {
      positionAddress:
        typeof positionAddress === "string"
          ? positionAddress
          : positionAddress.toBase58(),
      poolAddress:
        typeof poolAddress === "string" ? poolAddress : poolAddress.toBase58(),
      lowerBinId: positionData.lowerBinId,
      upperBinId: positionData.upperBinId,
      tokenXAmount: positionData.totalXAmount?.toString() ?? "0",
      tokenYAmount: positionData.totalYAmount?.toString() ?? "0",
      feeX: positionData.feeX?.toString() ?? "0",
      feeY: positionData.feeY?.toString() ?? "0",
      rewardOne: positionData.rewardOne?.toString() ?? "0",
      rewardTwo: positionData.rewardTwo?.toString() ?? "0",
      totalXAmount:
        positionData.totalXAmountExcludeTransferFee?.toString() ??
        positionData.totalXAmount?.toString() ??
        "0",
      totalYAmount:
        positionData.totalYAmountExcludeTransferFee?.toString() ??
        positionData.totalYAmount?.toString() ??
        "0",
      positionBinData: positionData.positionBinData.map((bin) => ({
        binId: bin.binId,
        positionXAmount: bin.positionXAmount?.toString() ?? "0",
        positionYAmount: bin.positionYAmount?.toString() ?? "0",
      })),
    };
  }

  /**
   * Parses PositionInfo map entries from getAllLbPairPositionsByUser.
   * Transforms SDK PositionInfo into a standardized array format.
   *
   * @param positionsMap - Map of position addresses to PositionInfo from SDK
   * @returns Array of parsed position data
   */
  async parsePositionsFromMap(
    positionsMap: Map<string, PositionInfo>
  ): Promise<ParsedPositionData[]> {
    const parsedPositions: ParsedPositionData[] = [];

    // @ts-expect-error
    for (const [positionAddress, positionInfo] of positionsMap.entries()) {
      const positionData = positionInfo.positionData;

      parsedPositions.push({
        positionAddress,
        poolAddress: positionInfo.publicKey.toBase58(),
        lowerBinId: positionData.lowerBinId,
        upperBinId: positionData.upperBinId,
        tokenXAmount: positionData.totalXAmount?.toString() ?? "0",
        tokenYAmount: positionData.totalYAmount?.toString() ?? "0",
        feeX: positionData.feeX?.toString() ?? "0",
        feeY: positionData.feeY?.toString() ?? "0",
        rewardOne: positionData.rewardOne?.toString() ?? "0",
        rewardTwo: positionData.rewardTwo?.toString() ?? "0",
        totalXAmount:
          positionData.totalXAmountExcludeTransferFee?.toString() ??
          positionData.totalXAmount?.toString() ??
          "0",
        totalYAmount:
          positionData.totalYAmountExcludeTransferFee?.toString() ??
          positionData.totalYAmount?.toString() ??
          "0",
        // @ts-expect-error
        positionBinData: positionData.positionBinData.map((bin) => ({
          binId: bin.binId,
          positionXAmount: bin.positionXAmount?.toString() ?? "0",
          positionYAmount: bin.positionYAmount?.toString() ?? "0",
        })),
      });
    }

    return parsedPositions;
  }

  // ============================================
  // Calculation Helpers
  // ============================================

  /**
   * Calculates the price range boundaries for a given bin interval.
   *
   * @param poolAddress - The pool's public key or base58 address
   * @param rangeInterval - Number of bins from active bin (e.g., 10 means ±10 bins)
   * @returns From and to prices in token Y per token X
   */
  async calculatePriceRange(
    poolAddress: string | PublicKey,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
    activeBinId: number;
    fromBinId: number;
    toBinId: number;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const activeBin = await dlmmPool.getActiveBin();
    const fromBinId = activeBin.binId - rangeInterval;
    const toBinId = activeBin.binId + rangeInterval;

    const fromPriceLamport = await getPriceOfBinByBinId(
      fromBinId,
      dlmmPool.lbPair.binStep
    );

    const toPriceLamport = await getPriceOfBinByBinId(
      toBinId,
      dlmmPool.lbPair.binStep
    );

    const fromPrice = dlmmPool.fromPricePerLamport(Number(fromPriceLamport));
    const toPrice = dlmmPool.fromPricePerLamport(Number(toPriceLamport));

    return {
      fromPrice,
      toPrice,
      activeBinId: activeBin.binId,
      fromBinId,
      toBinId,
    };
  }

  /**
   * Gets the current active bin and price for a pool.
   *
   * @param poolAddress - The pool's public key or base58 address
   * @returns Active bin ID and current price
   */
  async getActiveBinPrice(poolAddress: string | PublicKey): Promise<{
    binId: number;
    price: string;
    pricePerToken: string;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const activeBin = await dlmmPool.getActiveBin();

    return {
      binId: activeBin.binId,
      price: activeBin.price.toString(),
      pricePerToken: activeBin.pricePerToken.toString(),
    };
  }
}

export const meteoraDlmmService = new MeteoraDlmmService();
