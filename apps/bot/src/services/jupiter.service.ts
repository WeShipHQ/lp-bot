import { JupiterToken, TokenInfo } from "../types/token.types";

export class JupiterService {
  private readonly baseUrl = "https://lite-api.jup.ag";
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;
  
  private tokenInfoCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 1 * 60 * 1000; 

  /**
   * Fetch token information by address
   * @param tokenAddress - Solana token address
   * @returns Promise<TokenInfo | null>
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    // Check cache first
    const cachedToken = this.tokenInfoCache.get(tokenAddress);
    const now = Date.now();
    
    if (cachedToken && (now - cachedToken.timestamp) < this.CACHE_TTL) {
      return cachedToken.data;
    }
    
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[Jupiter] Retrying token info for: ${tokenAddress} (attempt ${attempt})`);
        }

        const searchResponse = await fetch(
          `${this.baseUrl}/tokens/v2/search?query=${tokenAddress}`
        );

        if (!searchResponse.ok) {
          throw new Error(`HTTP error! status: ${searchResponse.status}`);
        }

        const tokens: JupiterToken[] = await searchResponse.json();

        if (!tokens || tokens.length === 0) {
          return null;
        }

        const token = tokens.find((t) => t.id === tokenAddress) || tokens[0];
        const tokenInfo = this.mapJupiterTokenToTokenInfo(token);
        
        // Cache the result
        this.tokenInfoCache.set(tokenAddress, {
          data: tokenInfo,
          timestamp: now
        });

        return tokenInfo;
      } catch (error) {
        lastError = error as Error;
        console.error(`[Jupiter] API error for ${tokenAddress}:`, error);

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * Math.pow(2, attempt - 1)); 
        }
      }
    }
    
    throw new Error(`Failed to fetch token information: ${lastError?.message}`);
  }

  /**
   * Search for tokens by symbol or name
   * @param query - Search query
   * @returns Promise<TokenInfo[]>
   */
  async searchTokens(query: string): Promise<TokenInfo[]> {
    try {
      console.log(`[Jupiter] Searching tokens for: ${query}`);

      const searchResponse = await fetch(
        `${this.baseUrl}/tokens/v2/search?query=${encodeURIComponent(query)}`
      );

      if (!searchResponse.ok) {
        throw new Error(`HTTP error! status: ${searchResponse.status}`);
      }

      const tokens: JupiterToken[] = await searchResponse.json();

      return tokens.map((token) => this.mapJupiterTokenToTokenInfo(token));
    } catch (error) {
      console.error(`[Jupiter] Error searching tokens for ${query}:`, error);
      return [];
    }
  }

  /**
   * Get token price by address
   * @param tokenAddress - Solana token address
   * @returns Promise<number | null>
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    try {
      const tokenInfo = await this.getTokenInfo(tokenAddress);
      return tokenInfo?.price || null;
    } catch (error) {
      console.error(
        `[Jupiter] Error fetching price for ${tokenAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get multiple token prices
   * @param tokenAddresses - Array of token addresses
   * @returns Promise<Record<string, number>>
   */
  async getTokenPrices(
    tokenAddresses: string[]
  ): Promise<Record<string, number>> {
    console.log(
      `[Jupiter] Fetching prices for ${tokenAddresses.length} tokens`
    );

    const prices: Record<string, number> = {};

    // Process tokens in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < tokenAddresses.length; i += batchSize) {
      const batch = tokenAddresses.slice(i, i + batchSize);

      const batchPromises = batch.map(async (address) => {
        try {
          const price = await this.getTokenPrice(address);
          if (price !== null) {
            prices[address] = price;
          }
        } catch (error) {
          console.error(
            `[Jupiter] Error fetching price for ${address}:`,
            error
          );
        }
      });

      await Promise.all(batchPromises);

      // Add delay between batches
      if (i + batchSize < tokenAddresses.length) {
        await this.delay(500);
      }
    }

    return prices;
  }

  /**
   * Validate token address and check if it exists
   * @param tokenAddress - Token address to validate
   * @returns Promise<boolean>
   */
  async validateToken(tokenAddress: string): Promise<boolean> {
    try {
      console.log(`[Jupiter] Validating token: ${tokenAddress}`);

      const tokenInfo = await this.getTokenInfo(tokenAddress);
      return tokenInfo !== null;
    } catch (error) {
      console.error(`[Jupiter] Error validating token ${tokenAddress}:`, error);
      return false;
    }
  }

  /**
   * Map Jupiter API token response to our TokenInfo interface
   * @param jupiterToken - Token data from Jupiter API
   * @returns TokenInfo
   */
  private mapJupiterTokenToTokenInfo(jupiterToken: JupiterToken): TokenInfo {
    return {
      address: jupiterToken.id,
      name: jupiterToken.name,
      symbol: jupiterToken.symbol,
      icon: jupiterToken.icon,
      price: jupiterToken.usdPrice || 0,
      priceChange24h: jupiterToken.stats24h?.priceChange || 0,
      marketCap: jupiterToken.mcap || 0,
      volume24h:
        (jupiterToken.stats24h?.buyVolume || 0) +
        (jupiterToken.stats24h?.sellVolume || 0),
      liquidity: jupiterToken.liquidity || 0,
      isVerified: jupiterToken.isVerified || false,
      source: "jupiter",
    };
  }

  /**
   * Utility method to add delay
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const jupiterService = new JupiterService();
