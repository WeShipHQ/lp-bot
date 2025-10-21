import { solanaService } from "@/services/solana.service";
import { jupiterService } from "@/services/jupiter.service";

export interface TopTokenBalanceDto {
  mint: string;
  symbol: string;
  name?: string;
  balance: number;
  decimals?: number;
}

/**
 * Simple use case to fetch a small set of well-known token balances for a wallet.
 * This is intentionally lightweight and can be replaced with a real token-accounts
 * scanner later. For now, we fetch balances for a curated list (USDC, USDT, JUP, mSOL).
 */
export class GetTopTokenBalancesUseCase {
  // Well-known token mints on Solana mainnet
  private readonly topMints = [
    // USDC, USDT, JUP, mSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  ];

  constructor(
    private readonly solana = solanaService,
    private readonly jupiter = jupiterService
  ) {}

  async execute(walletAddress: string): Promise<TopTokenBalanceDto[]> {
    const results: TopTokenBalanceDto[] = [];

    for (const mint of this.topMints) {
      try {
        const info = await this.jupiter.getTokenInfo(mint);
        const { balance, decimals } = await this.solana.getTokenBalance(
          walletAddress,
          mint
        );

        results.push({
          mint,
          symbol: info?.symbol || "TOKEN",
          name: info?.name,
          balance: balance || 0,
          decimals,
        });
      } catch {
        // Best-effort; ignore failures and continue
      }
    }

    return results;
  }
}
