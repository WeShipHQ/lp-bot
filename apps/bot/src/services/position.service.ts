import { meteoraDlmmService } from "./meteora/dlmm.service";
import { meteoraPoolService } from "./meteora/pool.service";
import { jupiterService } from "./jupiter.service";
import BN from "bn.js";
import { WalletService } from "./wallet.service";
import { User } from "@/db";
import { SOL_MINT } from "@/config/constants";
import { meteoraPositionService } from "./meteora/position.service";
import { MeteoraDlmmPosition } from "@/types/meteora.types";

export class PositionService {
  async createPosition(
    user: User,
    poolAddress: string,
    depositType: "spot" | "curve" | "single",
    amount: number
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      console.log(
        `[Position] Creating ${depositType} position for user ${user.id}`
      );
      console.log(`[Position] Pool: ${poolAddress}, Amount: ${amount} SOL`);

      const poolInfo = await meteoraPoolService.getPoolInfo(
        poolAddress,
        "dlmm"
      );
      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      const halfAmount = amount / 2;
      const halfAmountLamports = (halfAmount * 1e9).toString();

      let tokenAAmount = new BN(0);
      let tokenBAmount = new BN(0);

      // Convert 50% SOL to token A (if not SOL)
      if (poolInfo.token_a_mint !== SOL_MINT) {
        try {
          const orderA = await jupiterService.getOrder({
            inputMint: SOL_MINT,
            outputMint: poolInfo.token_a_mint,
            amount: halfAmountLamports,
            taker: user.walletAddress!,
          });

          const swapTxStr = orderA.transaction;
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

          if (executeA.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token A: ${executeA.error}`
            );
          }
          tokenAAmount = new BN(executeA.outputAmountResult || "0");
        } catch (error) {
          console.error("Error converting SOL to token A:", error);
          throw error;
        }
      } else {
        tokenAAmount = new BN(halfAmountLamports);
      }

      // Convert 50% SOL to token B (if not SOL)
      if (poolInfo.token_b_mint !== SOL_MINT) {
        try {
          const orderB = await jupiterService.getOrder({
            inputMint: SOL_MINT,
            outputMint: poolInfo.token_b_mint,
            amount: halfAmountLamports,
            taker: user.walletAddress!,
          });

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

          if (executeB.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token B: ${executeB.error}`
            );
          }
          tokenBAmount = new BN(executeB.outputAmountResult || "0");
        } catch (error) {
          console.error("Error converting SOL to token B:", error);
          throw error;
        }
      } else {
        tokenBAmount = new BN(halfAmountLamports);
      }

      if (
        Number(tokenAAmount.toString()) === 0 ||
        Number(tokenBAmount.toString()) === 0
      ) {
        throw new Error("Failed to convert SOL to token A or token B");
      }

      const { instructions, signers } =
        await meteoraDlmmService.createPositionIx(
          poolAddress,
          user.walletAddress!,
          tokenAAmount,
          tokenBAmount,
          depositType
        );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions,
        signers
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

      return position;
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      return null;
    }
  }
}

export const positionService = new PositionService();
