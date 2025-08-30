import DLMM, {
  getPriceOfBinByBinId,
  StrategyType,
  autoFillXByStrategy,
  autoFillYByStrategy,
  PositionInfo,
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
    tokenXAmount: BN,
    tokenYAmount: BN,
    strategy: "spot" | "curve" | "single"
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

    // Define range interval
    const TOTAL_RANGE_INTERVAL = 20;
    const minBinId = activeBin.binId - TOTAL_RANGE_INTERVAL;
    const maxBinId = activeBin.binId + TOTAL_RANGE_INTERVAL;

    // Map strategy type
    let strategyType: StrategyType;
    switch (strategy) {
      case "spot":
        strategyType = StrategyType.Spot;
        break;
      case "curve":
        strategyType = StrategyType.Curve;
        break;
      case "single":
        strategyType = StrategyType.BidAsk;
        break;
      default:
        strategyType = StrategyType.Spot;
    }

    // Strategy 1: Use tokenXAmount and calculate Y amount
    let totalXAmount = tokenXAmount;
    let totalYAmount = autoFillYByStrategy(
      activeBin.binId,
      dlmmPool.lbPair.binStep,
      totalXAmount,
      activeBin.xAmount,
      activeBin.yAmount,
      minBinId,
      maxBinId,
      strategyType
    );

    console.log(
      `[DLMM] Strategy 1 - X: ${totalXAmount.toString()}, calculated Y: ${totalYAmount.toString()}, available Y: ${tokenYAmount.toString()}`
    );

    // Check if calculated Y amount exceeds available Y balance
    if (totalYAmount.gt(tokenYAmount)) {
      console.log(
        `[DLMM] Calculated Y amount (${totalYAmount.toString()}) exceeds available Y balance (${tokenYAmount.toString()}), trying strategy 2`
      );

      // Strategy 2: Use tokenYAmount and calculate X amount
      totalYAmount = tokenYAmount;
      const calculatedXAmount = autoFillXByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalYAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );

      console.log(
        `[DLMM] Strategy 2 - calculated X: ${calculatedXAmount.toString()}, available X: ${tokenXAmount.toString()}, Y: ${totalYAmount.toString()}`
      );

      // Check if calculated X amount also exceeds available X balance
      if (calculatedXAmount.gt(tokenXAmount)) {
        console.log(
          `[DLMM] Both calculated amounts exceed available balances. Cannot create position.`
        );
        throw new Error(
          `Insufficient balance: calculated X amount (${calculatedXAmount.toString()}) exceeds available X balance (${tokenXAmount.toString()}), and calculated Y amount from strategy 1 (${autoFillYByStrategy(
            activeBin.binId,
            dlmmPool.lbPair.binStep,
            tokenXAmount,
            activeBin.xAmount,
            activeBin.yAmount,
            minBinId,
            maxBinId,
            strategyType
          ).toString()}) exceeds available Y balance (${tokenYAmount.toString()})`
        );
      }

      // Use calculated X amount from strategy 2
      totalXAmount = calculatedXAmount;
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
          strategyType,
        },
      });

    return {
      instructions: createPositionTx.instructions,
      signers: [newBalancePosition],
    };
  }

  async getPriceRange(poolAddress: string): Promise<{
    fromPrice: number;
    fromPriceFormatted: number;
    toPrice: number;
    toPriceFormatted: number;
  }> {
    const dlmmPool = await this.createInstance(poolAddress);
    const activeBin = await dlmmPool.getActiveBin();
    const fromBinId = activeBin.binId - 20;
    const toBinId = activeBin.binId + 20;

    const fromPrice = await getPriceOfBinByBinId(
      fromBinId,
      dlmmPool.lbPair.binStep
    );
    const toPrice = await getPriceOfBinByBinId(
      toBinId,
      dlmmPool.lbPair.binStep
    );

    return {
      fromPrice: Number(fromPrice),
      fromPriceFormatted:
        Number(fromPrice) / 10 ** dlmmPool.tokenX.mint.decimals,
      toPrice: Number(toPrice),
      toPriceFormatted: Number(toPrice) / 10 ** dlmmPool.tokenY.mint.decimals,
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
