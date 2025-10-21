import { getCacheService, ICacheService } from "@/infrastructure/cache/cache.service";
import { SOL_MINT } from "@/config/constants";
import { solanaService } from "@/services/solana.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";

export interface GetTokenBalanceParams {
  walletAddress: string;
  tokenMint: string;
}

export class GetTokenBalanceUseCase {
  private readonly cache: ICacheService;
  constructor(private readonly solana = solanaService, cacheService: ICacheService = getCacheService()) {
    this.cache = cacheService;
  }

  async execute(params: GetTokenBalanceParams): Promise<{ balance: number; decimals: number }> {
    const { walletAddress, tokenMint } = params;

    if (tokenMint === SOL_MINT) {
      const sol = await this.solana.getBalance(walletAddress);
      return { balance: sol, decimals: 9 };
    }

    const cacheKey = CacheKeys.tokenBalanceKey(walletAddress, tokenMint);
    const cached = await this.cache.get<{ balance: number; decimals: number }>(cacheKey);
    if (cached) return cached;

    const res = await this.solana.getTokenBalance(walletAddress, tokenMint);
    await this.cache.set(cacheKey, res, 60);
    return res;
  }
}
