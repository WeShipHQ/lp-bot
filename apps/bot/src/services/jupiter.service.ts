import {
  JupiterToken,
  JupiterTokenInfo,
  JupiterTokenSearchResponse,
} from "@/types/jupiter.types";
import {
  JupiterOrderRequest,
  JupiterOrderResponse,
  JupiterExecuteRequest,
  JupiterExecuteResponse,
} from "../types/jupiter.types";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "@/bot/utils/http-client.util";
import { getCacheService } from '@/infrastructure/cache/cache.service';
import { CacheKeys } from '@/infrastructure/cache/cache-keys';
import { CircuitBreaker } from '@/infrastructure/resilience/circuit-breaker';
import { retry } from '@/infrastructure/resilience/retry';

export class JupiterService {
  private readonly baseUrl = "https://lite-api.jup.ag";
  private readonly tokenBaseUrl = "https://lite-api.jup.ag/tokens/v2";
  private readonly cache = getCacheService();
  private readonly breaker = new CircuitBreaker({ name: 'jupiter', failureThreshold: 5, successThreshold: 2, timeoutMs: 15000 });

  private mapJupiterTokenToTokenInfo(
    jupiterToken: JupiterToken
  ): JupiterTokenInfo {
    return {
      id: jupiterToken.id,
      name: jupiterToken.name,
      symbol: jupiterToken.symbol,
      icon: jupiterToken.icon,
      decimals: jupiterToken.decimals,
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

  async getTokenInfo(mintAddress: string): Promise<JupiterTokenInfo | null> {
    try {
      console.log(`[Jupiter] Fetching token info for: ${mintAddress}`);

      const response = await this.breaker.execute(
        () => api.getWithRetry<JupiterTokenSearchResponse>(`${this.tokenBaseUrl}/search?query=${mintAddress}`),
        async () => {
          // fallback: try cached price if available and return minimal info
          const price = await this.cache.get<number>(CacheKeys.tokenPriceKey(mintAddress));
          if (price != null) {
            return [
              { id: mintAddress, name: mintAddress, symbol: 'TOKEN', icon: '', decimals: 9, usdPrice: price, stats24h: undefined, mcap: 0, liquidity: 0, isVerified: false } as any,
            ];
          }
          return [] as any;
        }
      );

      if (!Array.isArray(response) || response.length === 0) {
        return null;
      }

      const token =
        response.find((t) => t.id === mintAddress) ||
        (response[0] as JupiterToken);
      return this.mapJupiterTokenToTokenInfo(token);
    } catch (error) {
      console.error(
        `[Jupiter] Error fetching token info ${mintAddress}:`,
        error
      );
      throw error;
    }
  }

  async getTokenPairInfo(
    tokenXAddress: string,
    tokenYAddress: string
  ): Promise<{
    tokenX: JupiterTokenInfo;
    tokenY: JupiterTokenInfo;
  }> {
    try {
      console.log(
        `[Jupiter] Fetching token info for: ${tokenXAddress}, ${tokenYAddress}`
      );

      const response = await this.breaker.execute(
        () => api.getWithRetry<JupiterTokenSearchResponse>(`${this.tokenBaseUrl}/search?query=${tokenXAddress},${tokenYAddress}`),
        async () => [] as any
      );

      if (!Array.isArray(response) || response.length < 2) {
        throw new Error(
          `[Jupiter] Error fetching token info ${tokenXAddress}, ${tokenYAddress}`
        );
      }

      const tokenX =
        response.find((t) => t.id === tokenXAddress) ||
        (response[0] as JupiterToken);
      const tokenY =
        response.find((t) => t.id === tokenYAddress) ||
        (response[1] as JupiterToken);

      return {
        tokenX: this.mapJupiterTokenToTokenInfo(tokenX),
        tokenY: this.mapJupiterTokenToTokenInfo(tokenY),
      };
    } catch (error) {
      console.error(
        `[Jupiter] Error fetching token info ${tokenXAddress}, ${tokenYAddress}:`,
        error
      );
      throw error;
    }
  }

  async searchTokens(query: string): Promise<JupiterTokenInfo[]> {
    try {
      console.log(`[Jupiter] Searching tokens for: ${query}`);

      const response = await api.getWithRetry<JupiterTokenInfo[]>(
        `${this.tokenBaseUrl}/search?query=${query}`
      );

      return response;
    } catch (error) {
      console.error(`[Jupiter] Error searching tokens for ${query}:`, error);
      return [];
    }
  }

  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    try {
      const key = CacheKeys.tokenPriceKey(tokenAddress);
      const cached = await this.cache.get<number>(key);
      if (typeof cached === 'number') return cached;

      const tokenInfo = await this.getTokenInfo(tokenAddress);
      const price = tokenInfo?.price || null;
      if (price != null) {
        await this.cache.set(key, price, 60); // 1-minute TTL
      }
      return price;
    } catch (error) {
      console.error(
        `[Jupiter] Error fetching price for ${tokenAddress}:`,
        error
      );
      return null;
    }
  }

  async getTokenPrices(
    tokenAddresses: string[]
  ): Promise<Record<string, number>> {
    console.log(
      `[Jupiter] Fetching prices for ${tokenAddresses.length} tokens`
    );

    const prices: Record<string, number> = {};

    // First, try cache for each
    const misses: string[] = [];
    for (const address of tokenAddresses) {
      const key = CacheKeys.tokenPriceKey(address);
      const cached = await this.cache.get<number>(key);
      if (typeof cached === 'number') {
        prices[address] = cached;
      } else {
        misses.push(address);
      }
    }

    // Process remaining tokens in batches
    const batchSize = 5;
    for (let i = 0; i < misses.length; i += batchSize) {
      const batch = misses.slice(i, i + batchSize);

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

      if (i + batchSize < misses.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return prices;
  }

  // async validateToken(tokenAddress: string): Promise<boolean> {
  //   try {
  //     console.log(`[Jupiter] Validating token: ${tokenAddress}`);

  //     const tokenInfo = await this.getTokenInfo(tokenAddress);
  //     return tokenInfo !== null;
  //   } catch (error) {
  //     console.error(`[Jupiter] Error validating token ${tokenAddress}:`, error);
  //     return false;
  //   }
  // }

  // private mapJupiterTokenToTokenInfo(
  //   jupiterToken: JupiterToken
  // ): JupiterTokenInfo {
  //   return {
  //     address: jupiterToken.id,
  //     name: jupiterToken.name,
  //     symbol: jupiterToken.symbol,
  //     icon: jupiterToken.icon,
  //     decimals: jupiterToken.decimals,
  //     price: jupiterToken.usdPrice || 0,
  //     priceChange24h: jupiterToken.stats24h?.priceChange || 0,
  //     marketCap: jupiterToken.mcap || 0,
  //     volume24h:
  //       (jupiterToken.stats24h?.buyVolume || 0) +
  //       (jupiterToken.stats24h?.sellVolume || 0),
  //     liquidity: jupiterToken.liquidity || 0,
  //     isVerified: jupiterToken.isVerified || false,
  //     source: "jupiter",
  //   };
  // }

  async getOrder(params: JupiterOrderRequest): Promise<JupiterOrderResponse> {
    try {
      console.log(
        `[Jupiter] Creating order for ${params.amount} ${params.inputMint} -> ${params.outputMint}`
      );

      const queryParams = new URLSearchParams({
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        ...(params.taker && { taker: params.taker }),
        ...(params.referralAccount && {
          referralAccount: params.referralAccount,
        }),
        ...(params.referralFee && {
          referralFee: params.referralFee.toString(),
        }),
      });

      const response = await this.breaker.execute(
        () => retry(() => fetch(`${this.baseUrl}/ultra/v1/order?${queryParams}`)),
        async () => {
          // No viable fallback for order creation
          return new Response(null, { status: 503, statusText: 'Service Unavailable' });
        }
      );

      if (!(response as any).ok) {
        throw new Error(`HTTP error! status: ${(response as any).status}`);
      }

      const orderResponse: JupiterOrderResponse = await (response as any).json();
      console.log(
        `[Jupiter] Order created successfully with requestId: ${orderResponse.requestId}`
      );

      return orderResponse;
    } catch (error) {
      console.error(`[Jupiter] Error creating order:`, error);
      throw new Error(
        `Failed to create swap order: ${(error as Error).message}`
      );
    }
  }

  async executeOrder(
    executeRequest: JupiterExecuteRequest
  ): Promise<JupiterExecuteResponse> {
    try {
      console.log(
        `[Jupiter] Executing order with requestId: ${executeRequest.requestId}`
      );

      const response = await this.breaker.execute(
        () => retry(() => fetch(`${this.baseUrl}/ultra/v1/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(executeRequest),
        })),
        async () => new Response(JSON.stringify({ status: 'Error', error: 'Service Unavailable' }), { status: 503 })
      );

      if (!(response as any).ok) {
        throw new Error(`HTTP error! status: ${(response as any).status}`);
      }

      const executeResponse: JupiterExecuteResponse = await (response as any).json();

      if (executeResponse.status === "Success") {
        console.log(
          `[Jupiter] Swap executed successfully: ${executeResponse.signature}`
        );
      } else {
        console.error(
          `[Jupiter] Swap execution failed:`,
          executeResponse.error
        );
      }

      return executeResponse;
    } catch (error) {
      console.error(`[Jupiter] Error executing order:`, error);
      throw new Error(
        `Failed to execute swap order: ${(error as Error).message}`
      );
    }
  }

  getOrderTransaction(transactionStr: string): VersionedTransaction {
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(transactionStr, "base64")
    );
    return transaction;
  }

  // async createSwap(params: SwapParams) {
  //   try {
  //     console.log(
  //       `[Jupiter] Starting swap process: ${params.amount} ${params.inputMint} -> ${params.outputMint}`
  //     );

  //     const orderResponse = await this.getOrder({
  //       inputMint: params.inputMint,
  //       outputMint: params.outputMint,
  //       amount: params.amount,
  //       taker: params.taker,
  //       referralAccount: params.referralAccount,
  //       referralFee: params.referralFee,
  //     });

  //     return {
  //       orderResponse,
  //       execute: async (signedTransaction: string): Promise<SwapResult> => {
  //         try {
  //           const executeResponse = await this.executeOrder({
  //             signedTransaction,
  //             requestId: orderResponse.requestId,
  //           });

  //           return {
  //             success: executeResponse.status === "Success",
  //             signature: executeResponse.signature,
  //             error: executeResponse.error,
  //             inputAmount: executeResponse.inputAmountResult,
  //             outputAmount: executeResponse.outputAmountResult,
  //             swapEvents: executeResponse.swapEvents,
  //           };
  //         } catch (error) {
  //           return {
  //             success: false,
  //             error: (error as Error).message,
  //           };
  //         }
  //       },
  //     };
  //   } catch (error) {
  //     console.error(`[Jupiter] Error in swap process:`, error);
  //     throw error;
  //   }
  // }
}

export const jupiterService = new JupiterService();
