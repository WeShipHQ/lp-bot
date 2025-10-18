import { getCacheService, ICacheService } from "@/infrastructure/cache/cache.service";
import { CacheKeys } from "@/infrastructure/cache/cache-keys";
import { solanaService } from "@/services/solana.service";

export interface WalletBalances {
  sol: number;
  // future: tokens: Record<string, number>
}

export class GetBalanceUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly solana = solanaService,
    cacheService: ICacheService = getCacheService()
  ) {
    this.cache = cacheService;
  }

  async execute(walletAddress: string): Promise<WalletBalances> {
    const cacheKey = CacheKeys.walletBalanceKey(walletAddress);
    const cached = await this.cache.get<WalletBalances>(cacheKey);
    if (cached) return cached;

    const sol = await this.solana.getBalance(walletAddress);
    const balances: WalletBalances = { sol };

    await this.cache.set(cacheKey, balances, 120); // 2 minutes TTL
    return balances;
  }
}
