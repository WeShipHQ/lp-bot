// import { getCacheService } from '@/infrastructure/cache/cache.service';
// import { CacheKeys } from '@/infrastructure/cache/cache-keys';
// import { JupiterService } from '@/services/jupiter.service';
// import { JupiterOrderRequest } from '@/types/jupiter.types';

// export class JupiterAdapter {
//   private readonly svc = new JupiterService();
//   private readonly cache = getCacheService();

//   async getTokenPrice(address: string): Promise<number | null> {
//     const key = CacheKeys.tokenPriceKey(address);
//     const cached = await this.cache.get<number>(key);
//     if (typeof cached === 'number') return cached;
//     const price = await this.svc.getTokenPrice(address);
//     if (price != null) await this.cache.set(key, price, 60);
//     return price;
//   }

//   async getSwapRoute(params: JupiterOrderRequest) {
//     return this.svc.getOrder(params);
//   }

//   async getTokenInfo(address: string) {
//     return this.svc.getTokenInfo(address);
//   }
// }
