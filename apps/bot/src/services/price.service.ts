export interface PriceData {
  price: number;
  change24h: number;
  lastUpdated: Date;
}

export class PriceService {
  private cache: Map<string, PriceData> = new Map();
  private cacheExpiry = 5 * 60 * 1000;

  /**
   * Get SOL price from CoinGecko API
   */
  async getSolPrice(): Promise<number> {
    try {
      const cached = this.cache.get('SOL');
      if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheExpiry) {
        return cached.price;
      }

      // Fetch from CoinGecko API
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true'
      );
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const price = data.solana.usd;
      const change24h = data.solana.usd_24h_change || 0;
      
      const priceData: PriceData = {
        price,
        change24h,
        lastUpdated: new Date()
      };
      
      this.cache.set('SOL', priceData);
      return price;
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      
      // Return cached price if available, otherwise fallback
      const cached = this.cache.get('SOL');
      if (cached) {
        return cached.price;
      }
      
      // Fallback price
      return 196;
    }
  }

  /**
   * Get price change in 24h
   */
  async getSolPriceChange24h(): Promise<number> {
    const cached = this.cache.get('SOL');
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheExpiry) {
      return cached.change24h;
    }
    
    // Fetch fresh data
    await this.getSolPrice();
    return this.cache.get('SOL')?.change24h || 0;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache status
   */
  getCacheStatus(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

export const priceService = new PriceService();
