import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import { CONFIG } from "../config";

export interface WalletInfo {
  address: string;
  privateKey: string;
}

export class SolanaService {
  private connection: Connection;
  private maxRetries = 3;
  private retryDelay = 1000; // 1 second

  constructor() {
    this.connection = new Connection(CONFIG.SOLANA.RPC_URL);
  }

  /**
   * Generate a new Solana wallet keypair
   * @returns WalletInfo containing address and private key
   */
  generateWallet(): WalletInfo {
    try {
      const keypair = Keypair.generate();
      return {
        address: keypair.publicKey.toString(),
        privateKey: JSON.stringify(Array.from(keypair.secretKey)),
      };
    } catch (error) {
      console.error("Error generating wallet:", error);
      throw new Error("Failed to generate wallet");
    }
  }

  /**
   * Get SOL balance for a given address
   * @param address - Solana wallet address
   * @returns Balance in SOL
   */
  async getBalance(address: string): Promise<number> {
    if (!this.validateAddress(address)) {
      throw new Error("Invalid Solana address");
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const publicKey = new PublicKey(address);
        const balance = await this.connection.getBalance(publicKey);
        return balance / LAMPORTS_PER_SOL;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `Attempt ${attempt} failed to fetch balance for ${address}:`,
          error
        );

        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    console.error(
      `Failed to fetch balance after ${this.maxRetries} attempts:`,
      lastError
    );
    throw new Error("Failed to fetch balance after multiple attempts");
  }

  /**
   * Validate if a string is a valid Solana address
   * @param address - Address to validate
   * @returns true if valid, false otherwise
   */
  validateAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get connection info for debugging
   * @returns Connection endpoint
   */
  getConnectionInfo(): string {
    return this.connection.rpcEndpoint;
  }

  /**
   * Utility method to add delay
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test connection to Solana network
   * @returns true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connection.getVersion();
      return true;
    } catch (error) {
      console.error("Solana connection test failed:", error);
      return false;
    }
  }

  /**
   * Get current SOL price in USD
   * @returns SOL price in USD
   */
  async getSolPrice(): Promise<number> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      return data.solana.usd || 0;
    } catch (error) {
      return 0;
    }
  }
}

// Export singleton instance
export const solanaService = new SolanaService();
