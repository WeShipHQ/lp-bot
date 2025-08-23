import {
  CloseMeteoraPositionParams,
  CreateMeteoraPositionParams,
} from "@/types/meteora.types";
import DLMM, {
  calculateSpotDistribution,
  StrategyType,
  autoFillXByStrategy,
  autoFillYByStrategy,
} from "@meteora-ag/dlmm";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import { meteoraService } from "../meteora.service";
import { solToLamports } from "@/utils/math";
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

  async createPosition(
    dlmmPool: DLMM,
    params: CreateMeteoraPositionParams
  ): Promise<Transaction> {
    return dlmmPool.initializePositionAndAddLiquidityByStrategy(params);
  }

  async createPositionByStrategy(dlmmPool: DLMM, poolAddress: string) {
    const poolInfo = await meteoraService.getDlmmPoolInfo(poolAddress);
    if (!poolInfo) throw new Error("Pool not found");

    console.log(poolInfo);

    const activeBin = await dlmmPool.getActiveBin();
    console.log(activeBin);

    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );
    console.log(activeBinPricePerToken);

    // const params: CreateMeteoraPositionParams = {
    //   positionPubKey: PublicKey.default,
    //   totalXAmount: new BN(0),
    //   totalYAmount: new BN(0),
    //   strategy: {
    //     maxBinId: 1,
    //     minBinId: 1,
    //     strategyType: StrategyType.Spot,
    //   },
    //   user: PublicKey.default,
    // };

    //return dlmmPool.initializePositionAndAddLiquidityByStrategy(params);
  }

  /**
   * Calculate deposit amounts for creating a DLMM position
   * @param poolAddress - The DLMM pool address
   * @param solAmount - Amount of SOL to use for the position
   * @param strategyType - Strategy type (default: Spot)
   * @param rangeInterval - Number of bins on each side of active bin (default: 10)
   * @returns Calculated deposit amounts for both tokens
   */
  async calculatePoolDepositAmount(
    poolAddress: string,
    solAmount: number,
    strategyType: StrategyType = StrategyType.Spot,
    rangeInterval: number = 20
  ): Promise<DepositAmountCalculation> {
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
    const dlmmPool: DLMM = await (DLMM as any).default.create(
      connection,
      new PublicKey(poolAddress)
    );

    // Get pool info for token symbols and decimals
    const poolInfo = await meteoraService.getDlmmPoolInfo(poolAddress);
    if (!poolInfo) throw new Error("Pool not found");

    const activeBin = await dlmmPool.getActiveBin();
    if (!activeBin) throw new Error("Active bin not found");
    console.log("check activeBin", activeBin);

    // Calculate bin range
    const minBinId = activeBin.binId - rangeInterval;
    const maxBinId = activeBin.binId + rangeInterval;

    // Get token decimals from the DLMM pool
    const tokenXDecimals = dlmmPool.tokenX.mint.decimals;
    const tokenYDecimals = dlmmPool.tokenY.mint.decimals;

    // Convert SOL amount to lamports for total value
    const totalValueLamports = solToLamports(solAmount);
    const activeBinPrice = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );

    console.log('activeBinPrice', activeBinPrice)

    // Check if this is a SOL pool (token X or Y is SOL)
    const isTokenXSol =
      poolInfo.token_a_symbol === "SOL" ||
      poolInfo.token_a_mint === "So11111111111111111111111111111111111111112";
    const isTokenYSol =
      poolInfo.token_b_symbol === "SOL" ||
      poolInfo.token_b_mint === "So11111111111111111111111111111111111111112";

    let totalXAmount: BN;
    let totalYAmount: BN;

    if (isTokenXSol) {
      // SOL is token X - we need to calculate how much SOL goes to X and how much equivalent value goes to Y
      // Use spot distribution to determine the ratio
      // const spotDistribution = calculateSpotDistribution(
      //   activeBin.binId,
      //   dlmmPool.lbPair.binStep,
      //   minBinId,
      //   maxBinId,
      //   strategyType
      // );

      // Calculate total X amount based on the distribution
      // The distribution gives us the ratio, we need to solve for X amount that gives us total SOL value
      const totalXAmountEstimate = new BN(totalValueLamports / 2); // Start with 50% estimate
      
      // Use autoFillYByStrategy to get the corresponding Y amount
      const correspondingYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalXAmountEstimate,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );

      // Calculate the actual value of Y in SOL terms
      const yValueInSol = correspondingYAmount.toNumber() / (10 ** tokenYDecimals) * Number(activeBinPrice);
      const xValueInSol = totalXAmountEstimate.toNumber() / (10 ** tokenXDecimals);
      const totalCurrentValue = xValueInSol + yValueInSol;

      // Scale to match our target SOL amount
      const scaleFactor = solAmount / totalCurrentValue;
      
      totalXAmount = new BN(Math.floor(totalXAmountEstimate.toNumber() * scaleFactor));
      totalYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalXAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );
    } else if (isTokenYSol) {
      // SOL is token Y - similar logic but reversed
      const totalYAmountEstimate = new BN(totalValueLamports / 2); // Start with 50% estimate
      
      const correspondingXAmount = autoFillXByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalYAmountEstimate,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );

      // Calculate the actual value of X in SOL terms
      const xValueInSol = correspondingXAmount.toNumber() / (10 ** tokenXDecimals) / Number(activeBinPrice);
      const yValueInSol = totalYAmountEstimate.toNumber() / (10 ** tokenYDecimals);
      const totalCurrentValue = xValueInSol + yValueInSol;

      // Scale to match our target SOL amount
      const scaleFactor = solAmount / totalCurrentValue;
      
      totalYAmount = new BN(Math.floor(totalYAmountEstimate.toNumber() * scaleFactor));
      totalXAmount = autoFillXByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        totalYAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );
    } else {
      // Neither token is SOL - need to convert SOL value to both tokens
      // This requires external price data (Jupiter API integration)
      // For now, we'll use a simplified approach assuming we can get token prices
      
      // Get SOL price in USD (you'll need to integrate with a price oracle)
      const solPriceInUSD = 100; // Placeholder - fetch from oracle
      const totalValueUSD = solAmount * solPriceInUSD;
      
      // For spot strategy, start with equal USD value distribution
      const initialXValueUSD = totalValueUSD * 0.5;
      const initialYValueUSD = totalValueUSD * 0.5;
      
      // Convert to token amounts (you'll need token prices from Jupiter/Oracle)
      // This is simplified - you'll need actual token prices
      const tokenXPriceUSD = 1; // Placeholder - get from Jupiter
      const tokenYPriceUSD = 1; // Placeholder - get from Jupiter
      
      const initialXAmount = new BN(
        Math.floor((initialXValueUSD / tokenXPriceUSD) * (10 ** tokenXDecimals))
      );
      
      // Use autoFillYByStrategy to get the proper ratio
      totalYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmmPool.lbPair.binStep,
        initialXAmount,
        activeBin.xAmount,
        activeBin.yAmount,
        minBinId,
        maxBinId,
        strategyType
      );
      
      // Calculate actual total value and scale
      const actualXValueUSD = (initialXAmount.toNumber() / (10 ** tokenXDecimals)) * tokenXPriceUSD;
      const actualYValueUSD = (totalYAmount.toNumber() / (10 ** tokenYDecimals)) * tokenYPriceUSD;
      const actualTotalValueUSD = actualXValueUSD + actualYValueUSD;
      
      const scaleFactor = totalValueUSD / actualTotalValueUSD;
      
      totalXAmount = new BN(Math.floor(initialXAmount.toNumber() * scaleFactor));
      totalYAmount = new BN(Math.floor(totalYAmount.toNumber() * scaleFactor));
    }

    console.log({
      tokenXAmount: totalXAmount.toString(),
      tokenYAmount: totalYAmount.toString(),
      tokenXSymbol: poolInfo.token_a_symbol,
      tokenYSymbol: poolInfo.token_b_symbol,
      tokenXDecimals,
      tokenYDecimals,
      totalValueInSOL: solAmount,
      pricePerToken: Number(activeBinPrice),
      strategy: {
        minBinId,
        maxBinId,
        activeBinId: activeBin.binId,
        rangeInterval,
      },
    });

    return {
      tokenXAmount: totalXAmount,
      tokenYAmount: totalYAmount,
      tokenXSymbol: poolInfo.token_a_symbol,
      tokenYSymbol: poolInfo.token_b_symbol,
      tokenXDecimals,
      tokenYDecimals,
      totalValueInSOL: solAmount,
      pricePerToken: Number(activeBinPrice),
      strategy: {
        minBinId,
        maxBinId,
        activeBinId: activeBin.binId,
        rangeInterval,
      },
    };
  }

  async closePosition(
    dlmmPool: DLMM,
    params: CloseMeteoraPositionParams
  ): Promise<Transaction> {
    return dlmmPool.closePosition(params);
  }
}

export const meteoraDlmmService = new MeteoraDlmmService();
