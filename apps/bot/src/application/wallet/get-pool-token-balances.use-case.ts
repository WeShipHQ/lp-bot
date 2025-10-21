import { UnifiedPool } from "@/types/core.types";
import { GetTokenBalanceUseCase } from "./get-token-balance.use-case";

export interface GetPoolTokenBalancesInput {
  walletAddress: string;
  pool: UnifiedPool;
}

export interface PoolTokenBalancesResult {
  tokenABalance: number;
  tokenBBalance: number;
}

export class GetPoolTokenBalancesUseCase {
  constructor(private readonly tokenBalance = new GetTokenBalanceUseCase()) {}

  async execute(input: GetPoolTokenBalancesInput): Promise<PoolTokenBalancesResult> {
    const { walletAddress, pool } = input;
    const [a, b] = await Promise.all([
      this.tokenBalance.execute({ walletAddress, tokenMint: pool.tokenA.address }),
      this.tokenBalance.execute({ walletAddress, tokenMint: pool.tokenB.address }),
    ]);

    return { tokenABalance: a.balance, tokenBBalance: b.balance };
  }
}
