import { DexscreenerToken } from "../types/trending.types";
import { CONFIG } from "../config";

export class DexscreenerService {
  private readonly baseUrl = CONFIG.DEXSCREENER.API_URL;

  async fetchTokenInfo(mint: string): Promise<DexscreenerToken> {
    try {
      const url = `${this.baseUrl}/tokens/${mint}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        return {};
      }

      return (await response.json()) as DexscreenerToken;
    } catch {
      return {};
    }
  }

  async fetchMultipleTokensInfo(
    mints: string[]
  ): Promise<Map<string, DexscreenerToken>> {
    const results = new Map<string, DexscreenerToken>();
    const batchSize = 5;

    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const promises = batch.map(async (mint) => {
        const data = await this.fetchTokenInfo(mint);
        return [mint, data] as [string, DexscreenerToken];
      });

      try {
        const batchResults = await Promise.all(promises);
        batchResults.forEach(([mint, data]) => {
          results.set(mint, data);
        });

        if (i + batchSize < mints.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch {
        // ignore batch errors
      }
    }
    return results;
  }
}

export const dexscreenerService = new DexscreenerService();
