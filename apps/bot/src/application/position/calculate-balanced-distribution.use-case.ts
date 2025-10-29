import { OPEN_POSITION_FEE, SOL_MINT } from "@/config/constants";
import { JupiterService } from "@/services/jupiter.service";
import { UnifiedPool } from "@/types/core.types";
import { rawToUiAmount, solToLamports } from "@/utils/number-utils";
import Decimal from "decimal.js";

export interface CalculateBalancedDistributionInput {
  pool: UnifiedPool;
  solAmount: number;
}

export interface CalculateBalancedDistributionResult {
  tokenAAmount: number;
  tokenBAmount: number;
}

export class CalculateBalancedDistributionUseCase {
  constructor(private readonly jupiter: JupiterService) {}

  async execute(
    input: CalculateBalancedDistributionInput
  ): Promise<CalculateBalancedDistributionResult> {
    const { pool, solAmount } = input;

    const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
    const netAmount = solAmount - feeAmount;
    const halfAmount = netAmount / 2;

    const tokenAAmount = await this.convertSolToToken(
      pool.tokenA.address,
      pool.tokenA.decimals,
      halfAmount
    );

    const tokenBAmount = await this.convertSolToToken(
      pool.tokenB.address,
      pool.tokenB.decimals,
      netAmount - halfAmount
    );

    return { tokenAAmount, tokenBAmount };
  }

  private async convertSolToToken(
    outputMint: string,
    decimals: number,
    amount: number
  ): Promise<number> {
    if (outputMint === SOL_MINT) {
      return amount;
    }

    const route = await this.jupiter.getOrder({
      inputMint: SOL_MINT,
      outputMint,
      amount: String(solToLamports(amount)),
    });

    if (!route.outAmount || Number.isNaN(Number(route.outAmount))) return 0;

    const outAmount = new Decimal(route.outAmount || "0");

    if (!outAmount) return 0;

    return rawToUiAmount(outAmount.toString(), decimals).toNumber();
  }
}
