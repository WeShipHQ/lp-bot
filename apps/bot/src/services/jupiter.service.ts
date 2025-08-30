import { JupiterToken, TokenInfo } from "../types/token.types";
import {
  JupiterOrderRequest,
  JupiterOrderResponse,
  JupiterExecuteRequest,
  JupiterExecuteResponse,
  SwapParams,
  SwapResult,
} from "../types/jupiter.types";
import { VersionedTransaction } from "@solana/web3.js";

export class JupiterService {
  private readonly baseUrl = "https://lite-api.jup.ag";
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;

  private tokenInfoCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 1 * 60 * 1000;

  async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    // Check cache first
    const cachedToken = this.tokenInfoCache.get(tokenAddress);
    const now = Date.now();

    if (cachedToken && now - cachedToken.timestamp < this.CACHE_TTL) {
      return cachedToken.data;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            `[Jupiter] Retrying token info for: ${tokenAddress} (attempt ${attempt})`
          );
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
          timestamp: now,
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

  private mapJupiterTokenToTokenInfo(jupiterToken: JupiterToken): TokenInfo {
    return {
      address: jupiterToken.id,
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

      const response = await fetch(
        `${this.baseUrl}/ultra/v1/order?${queryParams}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const orderResponse: JupiterOrderResponse = await response.json();
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

      const response = await fetch(`${this.baseUrl}/ultra/v1/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(executeRequest),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const executeResponse: JupiterExecuteResponse = await response.json();

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
