import { PrivyClient } from "@privy-io/server-auth";
import { CONFIG } from "../config";
import { Connection, VersionedTransaction, TransactionConfirmationStrategy } from "@solana/web3.js";

export const privy = new PrivyClient(
  CONFIG.PRIVY.PRIVY_APP_ID,
  CONFIG.PRIVY.PRIVY_APP_SECRET , {
    walletApi : {
      authorizationPrivateKey : CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY
    }
  }
);

/**
 * PrivyService class provides utilities for working with Privy API
 */
export class PrivyService {
  /**
   * Sign a Solana transaction using Privy wallet API
   * @param walletId - The Privy wallet ID
   * @param transaction - The transaction to sign
   * @returns The signed transaction
   */
  static async signSolanaTransaction(walletId: string, transaction: VersionedTransaction): Promise<VersionedTransaction> {
    const { signedTransaction } = await privy.walletApi.solana.signTransaction({
      walletId,
      transaction
    });
    
    if (!signedTransaction) {
      throw new Error("Failed to get signed transaction from Privy");
    }
    
    return signedTransaction as VersionedTransaction;
  }
  
  /**
   * Send and confirm a Solana transaction using Privy wallet API
   * @param walletId - The Privy wallet ID
   * @param transaction - The transaction to sign and send
   * @param connection - The Solana connection to use for sending
   * @returns The transaction signature
   */
  static async sendAndConfirmTransaction(
    walletId: string, 
    transaction: VersionedTransaction,
    connection: Connection
  ): Promise<string> {
    const signedTransaction = await this.signSolanaTransaction(walletId, transaction);
    
    const signature = await connection.sendRawTransaction(signedTransaction.serialize());
    
    try {
      const confirmationStrategy: TransactionConfirmationStrategy = {
        signature,
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      };
      
      await connection.confirmTransaction(confirmationStrategy, 'confirmed');
    } catch (error) {
      console.warn("Transaction sent but confirmation timed out", error instanceof Error ? error.message : 'Unknown error');
    }
    
    return signature;
  }
}