import DLMM, {
  getPriceOfBinByBinId,
  StrategyType,
  PositionInfo,
  LbPosition,
  LbPair,
} from "@meteora-ag/dlmm";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG } from "@/config";
import Decimal from "decimal.js";

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

/**
 * MeteoraDlmmService
 * 
 * Encapsulates all Meteora DLMM SDK interactions.
 * Provides transaction builders, position data parsing, and pool state retrieval.
 * 
 * All methods that interact with the DLMM SDK are contained here to keep
 * external callers unaware of Meteora-specific implementation details.
 */
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

    // Check if we have a valid cached instance
    const cached = this.poolCache.get(poolKey);
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.instance;
    }

    // Create new instance
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
    // @ts-ignore
    const instance = await DLMM.default.create(
      connection,
      new PublicKey(poolAddress)
    );

    // Cache the instance
    this.poolCache.set(poolKey, { instance, timestamp: now });

    return instance;
  }

  /**
   * Normalizes various address input types to PublicKey.
   * 
   * @param address - Address as string or PublicKey
   * @returns PublicKey instance
   * @private
   */
  private toPublicKey(address: string | PublicKey): PublicKey {
    return typeof address === "string" ? new PublicKey(address) : address;
  }

  /**
   * Normalizes various address input types to base58 string.
   * 
   * @param address - Address as string or PublicKey
   * @returns Base58 string representation
   * @private
   */
  private toBase58(address: string | PublicKey): string {
    return typeof address === "string" ? address : address.toBase58();
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
  async createPositionIx(
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
  async closePositionIx(
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
  async claimFeesIx(
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
   * @deprecated Use buildCreatePositionTx instead. This method is kept for backward compatibility.
   * Builds transaction instructions for creating a new position.
   * 
   * @param poolAddress - The pool's public key or base58 address
   * @param userPublicKey - The user's wallet public key or base58 address
   * @param totalXAmount - Token X amount as Decimal
   * @param totalYAmount - Token Y amount as Decimal
   * @param strategy - Position strategy type
   * @param rangeInterval - Price range interval in bins (note: internally uses fixed value of 5)
   * @returns Transaction instructions and generated position keypair
   */
  async buildCreatePositionIxs(
    poolAddress: string | PublicKey,
    userPublicKey: string | PublicKey,
    totalXAmount: Decimal,
    totalYAmount: Decimal,
    strategy: StrategyType,
    rangeInterval: number
  ): Promise<{
    instructions: TransactionInstruction[];
    positionKp: Keypair;
  }> {
    // Delegate to the new standardized method
    return this.buildCreatePositionTx(
      poolAddress,
      userPublicKey,
      totalXAmount,
      totalYAmount,
      strategy,
      rangeInterval
    );
  }

  /**
   * Gets all positions for a user.
   * Alias for getAllLbPairPositionsByUser.
   * 
   * @param userAddress - The user's wallet public key or base58 address
   * @returns Map of position addresses to PositionInfo from DLMM SDK
   */
  async getPositions(
    userAddress: string | PublicKey
  ): Promise<Map<string, PositionInfo>> {
    return this.getAllLbPairPositionsByUser(userAddress);
  }

  /**
   * Calculates price range boundaries for a given interval.
   * 
   * @param poolAddress - The pool's base58 address
   * @param rangeInterval - Number of bins from active bin
   * @returns Price range in token Y per token X
   */
  async getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
  }> {
    const range = await this.calculatePriceRange(poolAddress, rangeInterval);
    return {
      fromPrice: range.fromPrice,
      toPrice: range.toPrice,
    };
  }

  /**
   * Calculates price range for a balanced (spot) position.
   * Same as getPriceRange - kept for backward compatibility.
   * 
   * @param poolAddress - The pool's base58 address
   * @param rangeInterval - Number of bins from active bin
   * @returns Price range in token Y per token X
   */
  async getPriceRangeForBalancedPosition(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
  }> {
    return this.getPriceRange(poolAddress, rangeInterval);
  }

  /**
   * Calculates price range for a single-sided position.
   * Same as getPriceRange - kept for backward compatibility.
   * 
   * @param poolAddress - The pool's base58 address
   * @param rangeInterval - Number of bins from active bin
   * @returns Price range in token Y per token X
   */
  async getPriceRangeForSingleSidedPosition(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
  }> {
    return this.getPriceRange(poolAddress, rangeInterval);
  }

  /**
   * Retrieves all DLMM positions for a user across all pools.
   * Uses the DLMM SDK's static method to query positions.
   * 
   * @param walletAddress - The user's wallet public key or base58 address
   * @returns Map of position addresses to PositionInfo from DLMM SDK
   */
  async getAllLbPairPositionsByUser(
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
  async getPosition(
    positionAddress: string | PublicKey,
    poolAddress: string | PublicKey
  ): Promise<{
    lbPair: LbPair;
    lbPosition: LbPosition;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const lbPosition = await dlmmPool.getPosition(
      typeof positionAddress === "string"
        ? new PublicKey(positionAddress)
        : positionAddress
    );

    return {
      lbPair: dlmmPool.lbPair,
      lbPosition,
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
      poolAddress: this.toBase58(poolAddress),
      tokenX: {
        mint: dlmmPool.lbPair.tokenXMint.toBase58(),
        reserve: dlmmPool.lbPair.reserveX.toString(),
        decimals: dlmmPool.tokenX.decimal,
      },
      tokenY: {
        mint: dlmmPool.lbPair.tokenYMint.toBase58(),
        reserve: dlmmPool.lbPair.reserveY.toString(),
        decimals: dlmmPool.tokenY.decimal,
      },
      activeBinId: activeBin.binId,
      binStep: dlmmPool.lbPair.binStep,
      baseFeeRate: dlmmPool.lbPair.baseFeeRate?.toString() ?? "0",
      protocolFeeRate: dlmmPool.lbPair.protocolShare?.toString() ?? "0",
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
    const { lbPair, lbPosition } = await this.getPosition(
      positionAddress,
      poolAddress
    );

    if (!lbPosition) {
      throw new Error(`Position not found: ${this.toBase58(positionAddress)}`);
    }

    const positionData = lbPosition.positionData;

    return {
      positionAddress: this.toBase58(positionAddress),
      poolAddress: this.toBase58(poolAddress),
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
  // Transaction Builders (Standardized Naming)
  // ============================================

  /**
   * Builds transaction instructions for creating a new position.
   * Standardized method name: buildCreatePositionTx
   * 
   * @param poolAddress - The pool's public key or base58 address
   * @param userPublicKey - The user's wallet public key or base58 address
   * @param totalXAmount - Token X amount as Decimal
   * @param totalYAmount - Token Y amount as Decimal
   * @param strategy - Position strategy type (Spot, Curve, BidAsk)
   * @param rangeInterval - Price range interval in bins
   * @returns Transaction instructions and generated position keypair
   */
  async buildCreatePositionTx(
    poolAddress: string | PublicKey,
    userPublicKey: string | PublicKey,
    totalXAmount: Decimal,
    totalYAmount: Decimal,
    strategy: StrategyType,
    rangeInterval: number
  ): Promise<{
    instructions: TransactionInstruction[];
    positionKp: Keypair;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const activeBin = await dlmmPool.getActiveBin();
    const minBinId = activeBin.binId - rangeInterval;
    const maxBinId = activeBin.binId + rangeInterval;

    console.log(
      `[DLMM] buildCreatePositionTx - Active bin: ${activeBin.binId}, Range: [${minBinId}, ${maxBinId}], ` +
        `X: ${totalXAmount.toString()}, Y: ${totalYAmount.toString()}, Strategy: ${strategy}`
    );

    if (totalXAmount.isZero() && totalYAmount.isZero()) {
      throw new Error("Both token amounts cannot be zero");
    }

    const positionKeypair = Keypair.generate();

    const createPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: positionKeypair.publicKey,
        user: this.toPublicKey(userPublicKey),
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
      positionKp: positionKeypair,
    };
  }

  /**
   * Builds transaction instructions for closing a position.
   * Removes all liquidity and claims fees in a single transaction.
   * Standardized method name: buildClosePositionTx
   * 
   * @param ownerAddress - The position owner's public key or base58 address
   * @param poolAddress - The pool's public key or base58 address
   * @param positionAddress - The position's public key or base58 address
   * @returns Transaction instructions for closing position
   */
  async buildClosePositionTx(
    ownerAddress: string | PublicKey,
    poolAddress: string | PublicKey,
    positionAddress: string | PublicKey
  ): Promise<{ instructions: TransactionInstruction[] }> {
    return this.closePositionIx(
      this.toPublicKey(ownerAddress),
      this.toPublicKey(poolAddress),
      this.toPublicKey(positionAddress)
    );
  }

  /**
   * Builds transaction instructions for claiming fees from a position.
   * Standardized method name: buildClaimFeesTx
   * 
   * @param ownerAddress - The position owner's public key or base58 address
   * @param poolAddress - The pool's public key or base58 address
   * @param positionAddress - The position's public key or base58 address
   * @returns Transaction instructions for claiming fees
   */
  async buildClaimFeesTx(
    ownerAddress: string | PublicKey,
    poolAddress: string | PublicKey,
    positionAddress: string | PublicKey
  ): Promise<{ instructions: TransactionInstruction[] }> {
    return this.claimFeesIx(
      this.toPublicKey(ownerAddress),
      this.toPublicKey(poolAddress),
      this.toPublicKey(positionAddress)
    );
  }

  /**
   * Builds transaction instructions for rebalancing a position.
   * Closes old position and creates new one with updated range.
   * 
   * @param ownerAddress - The position owner's public key or base58 address
   * @param poolAddress - The pool's public key or base58 address
   * @param oldPositionAddress - The existing position's public key or base58 address
   * @param newTotalXAmount - New token X amount as Decimal
   * @param newTotalYAmount - New token Y amount as Decimal
   * @param strategy - Position strategy type
   * @param rangeInterval - New price range interval in bins
   * @returns Transaction instructions for close and create operations
   */
  async buildRebalanceTx(
    ownerAddress: string | PublicKey,
    poolAddress: string | PublicKey,
    oldPositionAddress: string | PublicKey,
    newTotalXAmount: Decimal,
    newTotalYAmount: Decimal,
    strategy: StrategyType,
    rangeInterval: number
  ): Promise<{
    closeInstructions: TransactionInstruction[];
    createInstructions: TransactionInstruction[];
    newPositionKp: Keypair;
  }> {
    const closeResult = await this.buildClosePositionTx(
      ownerAddress,
      poolAddress,
      oldPositionAddress
    );

    const createResult = await this.buildCreatePositionTx(
      poolAddress,
      ownerAddress,
      newTotalXAmount,
      newTotalYAmount,
      strategy,
      rangeInterval
    );

    return {
      closeInstructions: closeResult.instructions,
      createInstructions: createResult.instructions,
      newPositionKp: createResult.positionKp,
    };
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
  async getActiveBinPrice(
    poolAddress: string | PublicKey
  ): Promise<{
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
