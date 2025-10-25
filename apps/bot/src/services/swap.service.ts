import { User } from "@/db";
import { JupiterService } from "./jupiter.service";
import { WalletService } from "./wallet.service";
import Decimal from "decimal.js";
import { logger } from "@/utils/logger";
import { SOL_MINT } from "@/config/constants";

export interface SwapResult {
  success: boolean;
  signature?: string;
  inputAmount?: string;
  outputAmount?: string;
  error?: string;
}

/**
 * SwapService centralises Jupiter swap flows used by background jobs.
 * It supports token→SOL and SOL→token conversions using Privy wallets.
 */
export class SwapService {
  constructor(private readonly jupiter: JupiterService = new JupiterService()) {}

  async swapTokenToSol(
    user: User,
    tokenMint: string,
    rawAmount: string
  ): Promise<{ result: SwapResult; solReceived: Decimal }> {
    const amountDecimal = new Decimal(rawAmount || "0");
    if (amountDecimal.lte(0)) {
      return {
        result: { success: true, outputAmount: "0", inputAmount: rawAmount },
        solReceived: new Decimal(0),
      };
    }

    if (tokenMint === SOL_MINT) {
      const sol = amountDecimal.div(1_000_000_000);
      return {
        result: {
          success: true,
          outputAmount: sol.toDecimalPlaces(9, Decimal.ROUND_DOWN).toString(),
          inputAmount: rawAmount,
          signature: undefined,
        },
        solReceived: sol,
      };
    }

    try {
      const order = await this.jupiter.getOrder({
        inputMint: tokenMint,
        outputMint: SOL_MINT,
        amount: amountDecimal.toFixed(0),
        taker: user.walletAddress ?? "",
      });

      if (!order.transaction) {
        throw new Error("Jupiter order did not return a transaction payload");
      }

      const tx = this.jupiter.getOrderTransaction(order.transaction);
      const { signedTransaction } = await WalletService.signTransaction(user, tx);

      const execute = await this.jupiter.executeOrder({
        requestId: order.requestId,
        signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
          "base64"
        ),
      });

      if (execute.status !== "Success") {
        return {
          result: {
            success: false,
            error: execute.error || "Swap execution failed",
            inputAmount: order.inAmount,
          },
          solReceived: new Decimal(0),
        };
      }

      const solReceived = new Decimal(execute.outputAmountResult || "0").div(
        1_000_000_000
      );

      return {
        result: {
          success: true,
          signature: execute.signature,
          inputAmount: order.inAmount,
          outputAmount: solReceived
            .toDecimalPlaces(9, Decimal.ROUND_DOWN)
            .toString(),
        },
        solReceived,
      };
    } catch (error) {
      logger.warn(
        {
          tokenMint,
          amount: rawAmount,
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "[SwapService] Failed to swap token to SOL"
      );
      return {
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        solReceived: new Decimal(0),
      };
    }
  }

  async swapSolToToken(
    user: User,
    tokenMint: string,
    rawSolAmount: string
  ): Promise<{ result: SwapResult; tokenAmountLamports: Decimal }> {
    const solAmount = new Decimal(rawSolAmount || "0");
    if (solAmount.lte(0)) {
      return {
        result: { success: true, outputAmount: "0", inputAmount: rawSolAmount },
        tokenAmountLamports: new Decimal(0),
      };
    }

    const lamports = solAmount.mul(1_000_000_000).toFixed(0);

    try {
      const order = await this.jupiter.getOrder({
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        amount: lamports,
        taker: user.walletAddress ?? "",
      });

      if (!order.transaction) {
        throw new Error("Jupiter order did not return a transaction payload");
      }

      const tx = this.jupiter.getOrderTransaction(order.transaction);
      const { signedTransaction } = await WalletService.signTransaction(user, tx);

      const execute = await this.jupiter.executeOrder({
        requestId: order.requestId,
        signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
          "base64"
        ),
      });

      if (execute.status !== "Success") {
        return {
          result: {
            success: false,
            error: execute.error || "Swap execution failed",
            inputAmount: order.inAmount,
          },
          tokenAmountLamports: new Decimal(0),
        };
      }

      const tokenLamports = new Decimal(execute.outputAmountResult || "0");
      return {
        result: {
          success: true,
          signature: execute.signature,
          inputAmount: order.inAmount,
          outputAmount: tokenLamports.toFixed(0),
        },
        tokenAmountLamports: tokenLamports,
      };
    } catch (error) {
      logger.warn(
        {
          tokenMint,
          solAmount: rawSolAmount,
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "[SwapService] Failed to swap SOL to token"
      );
      return {
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        tokenAmountLamports: new Decimal(0),
      };
    }
  }
}
