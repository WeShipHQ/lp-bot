import { meteoraDlmmService } from "./meteora/dlmm.service";
import { jupiterService } from "./jupiter.service";
import BN from "bn.js";
import { WalletService } from "./wallet.service";
import { User } from "@/db";
import { SOL_MINT } from "@/config/constants";
import { meteoraPositionService } from "./meteora/position.service";
import {
  MeteoraCreatePositionStrategy,
  MeteoraDlmmPosition,
} from "@/types/meteora.types";
import { OPEN_POSITION_FEE } from "@/bot/config/constants";
import { StrategyType } from "@meteora-ag/dlmm";
import { poolService } from "./pool.service";
import { db, positions, transactions, NewPosition, NewTransaction } from "@/db";
import { Keypair, PublicKey } from "@solana/web3.js";
import { JobQueueService } from "./job-queue.service";

export class PositionService {
  private jobQueueService = new JobQueueService();

  async createBalancedPosition(
    user: User,
    poolAddress: string,
    depositType: MeteoraCreatePositionStrategy,
    enteredAmount: number
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
    positionId?: string;
  }> {
    try {
      console.log(
        `[Position] Creating ${depositType} position for user ${user.id}`
      );
      console.log(
        `[Position] Pool: ${poolAddress}, Amount: ${enteredAmount} SOL`
      );

      const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
      const amount = enteredAmount - feeAmount;

      const poolInfo = await poolService.getPoolV2(poolAddress);
      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      // Map strategy type
      let strategy: StrategyType;
      let dbStrategyType: "DLMM" | "DAMM" | "CONCENTRATED";
      switch (depositType) {
        case "spot":
          strategy = StrategyType.Spot;
          dbStrategyType = "DLMM";
          break;
        case "curve":
          strategy = StrategyType.Curve;
          dbStrategyType = "DLMM";
          break;
        case "single-sided":
          strategy = StrategyType.BidAsk;
          dbStrategyType = "DLMM";
          break;
        default:
          strategy = StrategyType.Spot;
          dbStrategyType = "DLMM";
      }

      const halfAmount = amount / 2;
      const halfAmountLamports = (halfAmount * 1e9).toString();

      console.log(`[Position] Starting SOL to Token A & B conversions...`);

      const [tokenAAmount, tokenBAmount] = await Promise.all([
        // Token A swap
        (async () => {
          if (poolInfo.tokenA.address !== SOL_MINT) {
            try {
              console.log(`[Position] Starting SOL to Token A conversion...`);
              const orderA = await jupiterService.getOrder({
                inputMint: SOL_MINT,
                outputMint: poolInfo.tokenA.address,
                amount: halfAmountLamports,
                taker: user.walletAddress!,
              });

              const swapTxStr = orderA.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token A");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const executeA = await jupiterService.executeOrder({
                requestId: orderA.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (executeA.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token A: ${executeA.error}`
                );
              }

              return new BN(executeA.outputAmountResult || "0");
            } catch (error) {
              console.error("Error converting SOL to token A:", error);
              throw error;
            }
          } else {
            return new BN(halfAmountLamports);
          }
        })(),

        // Token B swap
        (async () => {
          if (poolInfo.tokenB.address !== SOL_MINT) {
            try {
              console.log(`[Position] Starting SOL to Token B conversion...`);
              const orderB = await jupiterService.getOrder({
                inputMint: SOL_MINT,
                outputMint: poolInfo.tokenB.address,
                amount: halfAmountLamports,
                taker: user.walletAddress!,
              });

              const swapTxStr = orderB.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token B");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const executeB = await jupiterService.executeOrder({
                requestId: orderB.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (executeB.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token B: ${executeB.error}`
                );
              }

              return new BN(executeB.outputAmountResult || "0");
            } catch (error) {
              console.error("Error converting SOL to token B:", error);
              throw error;
            }
          } else {
            return new BN(halfAmountLamports);
          }
        })(),
      ]);

      if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
        throw new Error("Failed to convert SOL to token A or token B");
      }

      const positionKp = Keypair.generate();

      const { instructions } = await meteoraDlmmService.createPositionIx(
        positionKp.publicKey,
        new PublicKey(poolAddress),
        new PublicKey(user.walletAddress!),
        tokenAAmount,
        tokenBAmount,
        strategy,
        user.balancedPositionBinRange
      );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions,
        [positionKp]
      );

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      console.error(`[Position] Error creating position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create position",
      };
    }
  }

  async closePosition(
    user: User,
    // TODO create abstract type
    position: MeteoraDlmmPosition
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      console.log(
        `[Position] Closing position ${position.address} for user ${user.id}`
      );

      const { instructions } = await meteoraDlmmService.closePositionIx(
        user.walletAddress!,
        position.pair_address,
        position.address
      );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions
      );

      // @ts-expect-error
      async function swapToSol(positionAddress: string) {
        const { lbPosition, poolInfo } =
          await positionService.getPosition(positionAddress);
        const positionData = lbPosition?.positionData;
        if (!positionData || !poolInfo) return;

        const totalX = new BN(positionData.totalXAmount).add(positionData.feeX);
        const totalY = new BN(positionData.totalYAmount).add(positionData.feeY);

        console.log("totalX", totalX.toString());
        console.log("totalY", totalY.toString());

        if (poolInfo.tokenA.address !== SOL_MINT) {
          // swap x -> SOL
          const orderA = await jupiterService.getOrder({
            inputMint: poolInfo.tokenA.address,
            outputMint: SOL_MINT,
            amount: totalX.toString(),
            taker: user.walletAddress!,
          });

          const swapTxStr = orderA.transaction;
          console.log("swapTxStr", swapTxStr);
          if (!swapTxStr) {
            throw new Error("Failed to get swap transaction");
          }
          const swapTx = jupiterService.getOrderTransaction(swapTxStr);

          const { signedTransaction } = await WalletService.signTransaction(
            user,
            swapTx
          );

          const executeA = await jupiterService.executeOrder({
            requestId: orderA.requestId,
            signedTransaction: Buffer.from(
              signedTransaction.serialize()
            ).toString("base64"),
          });
          console.log("executeA", executeA);

          if (executeA.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token A: ${executeA.error}`
            );
          }
        }

        if (poolInfo.tokenB.address !== SOL_MINT) {
          // swap y -> SOL
          const orderB = await jupiterService.getOrder({
            inputMint: poolInfo.tokenB.address,
            outputMint: SOL_MINT,
            amount: totalY.toString(),
            taker: user.walletAddress!,
          });
          console.log("orderB", orderB);

          const swapTxStr = orderB.transaction;
          if (!swapTxStr) {
            throw new Error("Failed to get swap transaction");
          }
          const swapTx = jupiterService.getOrderTransaction(swapTxStr);

          const { signedTransaction } = await WalletService.signTransaction(
            user,
            swapTx
          );

          const executeB = await jupiterService.executeOrder({
            requestId: orderB.requestId,
            signedTransaction: Buffer.from(
              signedTransaction.serialize()
            ).toString("base64"),
          });

          console.log("executeB", executeB);

          if (executeB.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token B: ${executeB.error}`
            );
          }
        }
      }

      setTimeout(() => {
        swapToSol(position.address);
      }, 2000);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      console.error(`[Position] Error closing position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  async getPosition(positionAddress: string) {
    try {
      const position =
        await meteoraPositionService.getDlmmPosition(positionAddress);
      const poolInfo = await poolService.getPoolV2(position.pair_address);

      const { lbPosition } = await meteoraDlmmService.getPosition(
        positionAddress,
        position.pair_address
      );
      // console.log("lp pos", lbPosition);

      return { position, lbPosition, poolInfo };
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      return { position: null, lbPosition: null, poolInfo: null };
    }
  }
}

export const positionService = new PositionService();
