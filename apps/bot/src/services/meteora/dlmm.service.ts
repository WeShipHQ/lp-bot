import DLMM, {
  getPriceOfBinByBinId,
  StrategyType,
  PositionInfo,
  LbPosition,
  LbPair,
} from "@meteora-ag/dlmm";
import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { CONFIG } from "@/config";
import Decimal from "decimal.js";

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

export class MeteoraDlmmService {
  private poolCache = new Map<string, { instance: DLMM; timestamp: number }>();
  private readonly CACHE_TTL = 30000; // 30 seconds

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

  async getPriceRange(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
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
    };
  }

  async getPriceRangeForBalancedPosition(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
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
    };
  }

  async getPriceRangeForSingleSidedPosition(
    poolAddress: string,
    rangeInterval: number
  ): Promise<{
    fromPrice: string;
    toPrice: string;
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
    };
  }

  async getAllLbPairPositionsByUser(
    walletAddress: string | PublicKey
  ): Promise<Map<string, PositionInfo>> {
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

    // @ts-expect-error
    return DLMM.default.getAllLbPairPositionsByUser(
      connection,
      typeof walletAddress === "string"
        ? new PublicKey(walletAddress)
        : walletAddress
    );
  }

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
}

export const meteoraDlmmService = new MeteoraDlmmService();
