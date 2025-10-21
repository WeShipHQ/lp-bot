import { OPEN_POSITION_FEE, SOL_MINT } from "@/config/constants";
import { JupiterAdapter } from "@/adapters/external-api/jupiter.adapter";
import { UnifiedPool } from "@/types/core.types";

export interface CalculateBalancedDistributionInput {
  pool: UnifiedPool;
  solAmount: number; // UI amount in SOL
}

export interface CalculateBalancedDistributionResult {
  tokenAAmount: number;
  tokenBAmount: number;
}

/**
 * Calculate a 50/50 balanced distribution for a SOL auto-convert deposit.
 * - Deducts OPEN_POSITION_FEE from the entered SOL amount
 * - Splits the remaining SOL 50/50
 * - Converts each half into tokenA/tokenB when needed using Jupiter quotes
 */
export class CalculateBalancedDistributionUseCase {
  constructor(private readonly jupiter = new JupiterAdapter()) {}

  async execute(
    input: CalculateBalancedDistributionInput
  ): Promise<CalculateBalancedDistributionResult> {
    const { pool, solAmount } = input;

    const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
    const netAmount = solAmount - feeAmount;

    const halfAmount = netAmount / 2;
    const halfAmountLamports = Math.floor(halfAmount * 1e9);

    const tokenAAmount = await this.convertSolToToken(
      pool.tokenA.address,
      pool.tokenA.decimals,
      halfAmountLamports
    );

    const tokenBAmount = await this.convertSolToToken(
      pool.tokenB.address,
      pool.tokenB.decimals,
      halfAmountLamports
    );

    return { tokenAAmount, tokenBAmount };
  }

  private async convertSolToToken(
    outputMint: string,
    decimals: number,
    lamports: number
  ): Promise<number> {
    if (outputMint === SOL_MINT) {
      return lamports / 1e9;
    }

    const route = await this.jupiter.getSwapRoute({
      inputMint: SOL_MINT,
      outputMint,
      amount: String(lamports),
    } as any);

    const outAmount = parseInt(route.outAmount || "0", 10);
    if (!outAmount) return 0;
    return outAmount / Math.pow(10, decimals);
  }
}
