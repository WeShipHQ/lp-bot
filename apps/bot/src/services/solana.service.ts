import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  clusterApiUrl,
  TransactionMessage,
  VersionedTransaction,
  AccountMeta
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
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

export interface TransferTokenParams {
  walletId: string;
  walletAddress: string;
  recipientAddress: string;
  tokenAddress: string;
  amount: number;
  decimals: number;
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
   * @returns Object containing transaction signature and actual amount sent
   */
  /**
   * Get token account address for a wallet and token
   * @param walletAddress - Wallet address
   * @param tokenAddress - Token mint address
   * @returns Associated token account address
   */
  async getTokenAccountAddress(walletAddress: string, tokenAddress: string): Promise<string> {
    if (!this.validateAddress(walletAddress) || !this.validateAddress(tokenAddress)) {
      throw new Error("Invalid wallet or token address");
    }

    // This is a simplified version - in a real implementation, you'd use getAssociatedTokenAddress
    // from @solana/spl-token, but we're trying to avoid direct dependencies on that package
    // since we're using Privy for signing
    
    // Implement retry with exponential backoff for RPC rate limiting
    let lastError: Error | null = null;
    const maxRetries = 5;
    let baseDelay = 500; // Start with 500ms delay
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Query the token accounts owned by this wallet
        const accounts = await this.connection.getParsedTokenAccountsByOwner(
          new PublicKey(walletAddress),
          { mint: new PublicKey(tokenAddress) }
        );

        // Return the first account if found
        if (accounts.value.length > 0) {
          return accounts.value[0].pubkey.toString();
        }
        
        throw new Error("Token account not found");
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error
        const isRateLimit = 
          error.message?.includes("429") || 
          error.message?.includes("Too Many Requests");
          
        if (isRateLimit && attempt < maxRetries - 1) {
          // Calculate delay with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not a rate limit or last attempt, rethrow
        console.error("Error getting token account address:", error);
        throw new Error(`Failed to get token account: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    
    // If we've exhausted all retries
    throw lastError || new Error("Failed to get token account after multiple retries");
  }

  /**
   * Get token balance for a given wallet and token
   * @param walletAddress - Wallet address
   * @param tokenAddress - Token mint address
   * @returns Token balance and decimals
   */
  async getTokenBalance(walletAddress: string, tokenAddress: string): Promise<{ balance: number; decimals: number }> {
    if (!this.validateAddress(walletAddress) || !this.validateAddress(tokenAddress)) {
      throw new Error("Invalid wallet or token address");
    }

    // Implement retry with exponential backoff for RPC rate limiting
    let lastError: Error | null = null;
    const maxRetries = 5;
    let baseDelay = 500; // Start with 500ms delay
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Query the token accounts owned by this wallet
        const accounts = await this.connection.getParsedTokenAccountsByOwner(
          new PublicKey(walletAddress),
          { mint: new PublicKey(tokenAddress) }
        );

        // If no accounts found, return 0 balance
        if (accounts.value.length === 0) {
          return { balance: 0, decimals: 0 };
        }

        // Get the token account data
        const accountInfo = accounts.value[0].account.data.parsed;
        const balance = accountInfo.info.tokenAmount.uiAmount;
        const decimals = accountInfo.info.tokenAmount.decimals;

        return { balance, decimals };
      } catch (error: any) {
        lastError = error;
        
        // Check if it's a rate limit error
        const isRateLimit = 
          error.message?.includes("429") || 
          error.message?.includes("Too Many Requests");
          
        if (isRateLimit && attempt < maxRetries - 1) {
          // Calculate delay with exponential backoff
          const delay = baseDelay * Math.pow(2, attempt);

          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not a rate limit or last attempt, rethrow
        console.error("Error getting token balance:", error);
        throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    
    // If we've exhausted all retries
    throw lastError || new Error("Failed to get token balance after multiple retries");
  }

  /**
   * Transfer SPL token using Privy wallet API
   * @param params - Transfer parameters
   * @returns Object containing transaction signature
   */
  async transferToken(params: TransferTokenParams): Promise<{ signature: string }> {
    try {
      const { walletId, walletAddress, recipientAddress, tokenAddress, amount, decimals } = params;
      
      // Validate addresses
      if (!this.validateAddress(recipientAddress)) {
        throw new Error("Invalid recipient address");
      }
      
      if (!this.validateAddress(tokenAddress)) {
        throw new Error("Invalid token address");
      }
      
      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }
      
      // Step 1: Create connection to Solana network
      const connection = new Connection(clusterApiUrl("mainnet-beta"));
      
      // Step 2: Get token accounts
      let sourceTokenAccount;
      try {
        sourceTokenAccount = await this.getTokenAccountAddress(walletAddress, tokenAddress);
      } catch (error) {
        throw new Error("You don't have a token account for this token");
      }
      
      // Step 3: Create a valid placeholder wallet public key
      const walletPublicKey = new PublicKey(walletAddress);
      const sourceTokenAccountPubkey = new PublicKey(sourceTokenAccount);
      const tokenMintPubkey = new PublicKey(tokenAddress); // Used for reference
      
      // Step 4: For recipient token account, we need to make sure it exists
      // In Solana, token accounts need to be created before tokens can be transferred
      const recipientPubkey = new PublicKey(recipientAddress);
      
      // Check if the recipient already has a token account
      let destinationTokenAccount;
      try {
        // Try to find existing token account
        destinationTokenAccount = await this.getTokenAccountAddress(recipientAddress, tokenAddress);

      } catch (error) {
        // If not found, we need to inform the user that they need to create a token account first

        throw new Error(
          "Recipient doesn't have a token account for this token yet. " +
          "They need to interact with this token first (e.g., receive a small amount from another source) " +
          "before you can send to them using this bot."
        );
      }
      
      const destinationTokenAccountPubkey = new PublicKey(destinationTokenAccount);
      
      // Step 5: Calculate amount in raw units based on decimals
      const rawAmount = Math.floor(amount * (10 ** decimals));
      
      // Step 6: Create transfer instruction (SPL token transfer)
      // We're manually creating the instruction since we're not using @solana/spl-token directly
      const keys: AccountMeta[] = [
        { pubkey: sourceTokenAccountPubkey, isSigner: false, isWritable: true },
        { pubkey: destinationTokenAccountPubkey, isSigner: false, isWritable: true },
        { pubkey: walletPublicKey, isSigner: true, isWritable: false }
      ];
      
      // SPL Token Transfer instruction (3 is the instruction index for transfer)
      const dataLayout = Buffer.alloc(9);
      dataLayout.writeUInt8(3, 0); // Transfer instruction
      // Write amount as a 64-bit integer
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(BigInt(rawAmount));
      amountBuffer.copy(dataLayout, 1);
      
      const instruction = {
        programId: TOKEN_PROGRAM_ID,
        keys,
        data: dataLayout
      };
      
      // Step 7: Get recent blockhash
      const { blockhash: recentBlockhash } = await connection.getLatestBlockhash();
      
      // Step 8: Create transaction message
      const message = new TransactionMessage({
        payerKey: walletPublicKey,
        instructions: [instruction],
        recentBlockhash
      });
      
      // Step 9: Create versioned transaction
      const transaction = new VersionedTransaction(message.compileToV0Message());
      
      // Step 10: Sign the transaction using Privy SDK
      const { signedTransaction } = await privy.walletApi.solana.signTransaction({
        walletId,
        transaction
      });
      
      if (!signedTransaction) {
        throw new Error("Failed to get signed transaction from Privy");
      }
      
      // Step 11: Send the signed transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Step 12: Wait for confirmation but don't throw if it times out
      try {
        await connection.confirmTransaction(signature, 'confirmed');
      } catch (confirmError) {
        // Transaction was sent but confirmation timed out - this is usually fine
      }
      
      return { signature };
    } catch (error) {
      console.error("Error transferring token via Privy:", error);
      
      // Provide more helpful error messages based on common issues
      let errorMessage = "Failed to transfer token";
      
      if (error instanceof Error) {
        const errorStr = error.toString();
        
        if (errorStr.includes("invalid account data")) {
          errorMessage = "Transfer failed: The recipient doesn't have a token account for this token yet. " +
            "They need to interact with this token first (e.g., receive a small amount from another source) " +
            "before you can send to them.";
        } else if (errorStr.includes("insufficient funds")) {
          errorMessage = "Transfer failed: Insufficient funds to complete this transaction.";
        } else if (errorStr.includes("429") || errorStr.includes("Too Many Requests")) {
          errorMessage = "Transfer failed: The network is busy. Please try again later.";
        } else {
          errorMessage = `Failed to transfer token: ${error.message}`;
        }
      }
      
      throw new Error(errorMessage);
    }
  }

  async transferSol(params: TransferSolParams): Promise<{ signature: string; actualAmount: number }> {
    try {
      const { walletId, walletAddress, recipientAddress, amount } = params;
      
      // Validate recipient address
      if (!this.validateAddress(recipientAddress)) {
        throw new Error("Invalid recipient address");
      }
      
      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }
      
      // Step 1: Get current balance and reserve some for transaction fee
      const FEE_RESERVE = 0.001 * LAMPORTS_PER_SOL; // Reserve 0.001 SOL for transaction fee
      let adjustedAmount = amount;
      let lamports;
      
      try {
        // Get current balance
        const balance = await this.getBalance(walletAddress);
        const balanceLamports = Math.floor(balance * LAMPORTS_PER_SOL);
        
        const isTransferAll = Math.abs(balance - amount) < 0.0001;
        
        if (isTransferAll || balanceLamports <= Math.floor(amount * LAMPORTS_PER_SOL) + FEE_RESERVE) {
          adjustedAmount = Math.max(0, (balanceLamports - FEE_RESERVE) / LAMPORTS_PER_SOL);
          
          if (adjustedAmount < 0.00001) {
            throw new Error("Insufficient funds to cover both transfer amount and transaction fees.");
          }
        }
        
        // Convert adjusted amount to lamports
        lamports = Math.floor(adjustedAmount * LAMPORTS_PER_SOL);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes("Insufficient funds")) {
          throw error;
        }
        // If balance check fails, use the original amount
        // Fallback to original amount if balance check fails
        lamports = Math.floor(amount * LAMPORTS_PER_SOL);
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
        // Transaction was sent but confirmation timed out - this is usually fine
      }
      
      return {
        signature,
        actualAmount: adjustedAmount
      };
    } catch (error) {
      console.error("Error transferring SOL via Privy:", error);
      throw new Error(
        `Failed to transfer SOL: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export const solanaService = new SolanaService();
