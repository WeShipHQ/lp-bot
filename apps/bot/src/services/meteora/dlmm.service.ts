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
  Keypair,
  TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { meteoraPoolService } from "../meteora/pool.service";
import { CONFIG } from "@/config";
import { TOTAL_RANGE_INTERVAL } from "@/bot/config/constants";

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
  async createPool(
    connection: Connection,
    poolAddress: PublicKey
  ): Promise<DLMM> {
    // @ts-ignore
    return DLMM.default.create(connection, poolAddress);
  }

  private async createInstance(poolAddress: string | PublicKey): Promise<DLMM> {
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
    // @ts-ignore
    return DLMM.default.create(connection, new PublicKey(poolAddress));
  }

  async createPositionIx(
    poolAddress: string,
    userPublicKey: string,
    totalXAmount: BN,
    totalYAmount: BN,
    strategy: StrategyType,
    rangeInterval: number
  ): Promise<{
    instructions: TransactionInstruction[];
    signers: Keypair[];
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const poolInfo = await meteoraPoolService.getDlmmPoolInfo(poolAddress);
    if (!poolInfo) {
      throw new Error("Pool not found");
    }

    const activeBin = await dlmmPool.getActiveBin();
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );

    console.log(
      `[DLMM] Active bin ID: ${activeBin.binId}, Price: ${activeBinPricePerToken}`
    );

    const minBinId = activeBin.binId - rangeInterval;
    const maxBinId = activeBin.binId + rangeInterval;

    if (totalXAmount.isZero() && totalYAmount.isZero()) {
      throw new Error("Invalid amount");
    }

    console.log(
      `[DLMM] Final amounts - X: ${totalXAmount.toString()}, Y: ${totalYAmount.toString()}`
    );

    const newBalancePosition = new Keypair();
    const user = new PublicKey(userPublicKey);

    const createPositionTx =
      await dlmmPool.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newBalancePosition.publicKey,
        user: user,
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType: strategy,
        },
      });

    return {
      instructions: createPositionTx.instructions,
      signers: [newBalancePosition],
    };
  }

  async getPriceRange(poolAddress: string, rangeInterval: number): Promise<{
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
    lpPair: LbPair;
    lbPosition: LbPosition;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);

    const lbPosition = await dlmmPool.getPosition(
      typeof positionAddress === "string"
        ? new PublicKey(positionAddress)
        : positionAddress
    );

    return {
      lpPair: dlmmPool.lbPair,
      lbPosition,
    };
  }

  async closePositionIx(
    ownerAddress: string | PublicKey,
    poolAddress: string | PublicKey,
    positionAddress: string | PublicKey
  ): Promise<{
    instructions: TransactionInstruction[];
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const position = await dlmmPool.getPosition(
      typeof positionAddress === "string"
        ? new PublicKey(positionAddress)
        : positionAddress
    );

    if (!position) {
      throw new Error("Position not found");
    }

    const binIdsToRemove = position.positionData.positionBinData.map(
      (bin) => bin.binId
    );

    const removeLiquidityTx = await dlmmPool.removeLiquidity({
      position: position.publicKey,
      user:
        typeof ownerAddress === "string"
          ? new PublicKey(ownerAddress)
          : ownerAddress,
      fromBinId: binIdsToRemove[0],
      toBinId: binIdsToRemove[binIdsToRemove.length - 1],
      bps: new BN(100 * 100), // 100% (range from 0 to 100)
      shouldClaimAndClose: true, // should claim swap fee and close position together
    });

    return {
      instructions: removeLiquidityTx.flatMap((tx) => tx.instructions),
    };
  }
}

export const meteoraDlmmService = new MeteoraDlmmService();
