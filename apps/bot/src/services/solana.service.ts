import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
  TransactionMessage,
  VersionedTransaction
} from "@solana/web3.js";
import { privy } from "./privy.service";
import { CONFIG } from "../config";

export interface WalletInfo {
  address: string;
  privateKey: string;
}

export interface TransferSolParams {
  walletId: string;
  walletAddress: string;
  recipientAddress: string;
  amount: number;
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

  /**
   * Transfer SOL using Privy wallet API
   * @param params - Transfer parameters
   * @returns Transaction signature
   */
  async transferSol(params: TransferSolParams): Promise<string> {
    try {
      const { walletId, walletAddress, recipientAddress, amount } = params;
      
      // Validate recipient address
      if (!this.validateAddress(recipientAddress)) {
        throw new Error("Invalid recipient address");
      }
      
      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }
      
      // Step 1: Convert SOL to lamports
      // Reserve 0.001 SOL for transaction fee to avoid insufficient funds error
      const FEE_RESERVE = 0.001 * LAMPORTS_PER_SOL;
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Check if the amount is too close to the balance
      try {
        const balance = await this.getBalance(walletAddress);
        const balanceLamports = Math.floor(balance * LAMPORTS_PER_SOL);
        
        if (balanceLamports <= lamports + FEE_RESERVE) {
          // Not enough funds for transfer + fee, adjust the amount
          const maxAmount = Math.max(0, balanceLamports - FEE_RESERVE) / LAMPORTS_PER_SOL;
          throw new Error(`Insufficient funds. Maximum transferable amount is approximately ${maxAmount.toFixed(5)} SOL after accounting for fees.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("Maximum transferable")) {
          throw error;
        }
        // If balance check fails, continue with the original amount
        console.warn("Failed to check balance before transfer, proceeding anyway");
      }
      
      // Step 2: Create connection to Solana network
      const connection = new Connection(clusterApiUrl("mainnet-beta"));
      
      // Step 3: Create a valid placeholder wallet public key
      // Privy will replace this with the actual wallet address during signing
      // Use a real Solana address format to avoid base58 errors
      const walletPublicKey = new PublicKey(walletAddress);
      
      // Step 5: Create transfer instruction
      const instruction = SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey: new PublicKey(recipientAddress),
        lamports
      });
      
      // Step 6: Get recent blockhash
      const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
      
      // Step 7: Create transaction message
      const message = new TransactionMessage({
        payerKey: walletPublicKey,
        instructions: [instruction],
        recentBlockhash
      });
      
      // Step 8: Create versioned transaction
      const transaction = new VersionedTransaction(message.compileToV0Message());
      
      // Step 9: Sign the transaction using Privy SDK
      const { signedTransaction } = await privy.walletApi.solana.signTransaction({
        walletId,
        transaction
      });
      
      if (!signedTransaction) {
        throw new Error("Failed to get signed transaction from Privy");
      }
      
      // Step 10: Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Step 11: Wait for confirmation but don't throw if it times out
      try {
        await connection.confirmTransaction(signature, 'confirmed');
      } catch (confirmError) {
        console.warn("Transaction confirmation error, but transaction was sent:", confirmError);
        // Don't throw here - the transaction might still succeed even if confirmation times out
      }
      
      return signature;
    } catch (error) {
      console.error("Error transferring SOL via Privy:", error);
      throw new Error(
        `Failed to transfer SOL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

// Export singleton instance
export const solanaService = new SolanaService();
