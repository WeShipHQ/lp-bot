import { generateAuthorizationSignature } from "@privy-io/server-auth/wallet-api";
import { CONFIG } from "../config";
import { generateRecipientKeypair } from "../bot/utils/hpke-keygen";
import { decryptHPKEMessage } from "../bot/utils/hpke-decrypt";

export interface WalletExportResult {
  privateKey: string;
}

export class WalletService {
  /**
   * Export and decrypt wallet from Privy
   * @param walletId - The Privy wallet ID to export
   * @returns Decrypted wallet information
   */
  static async exportAndDecryptWallet(walletId: string): Promise<WalletExportResult> {
    try {
      // 1. Generate keypair for HPKE encryption
      const { publicKeyBase64, privateKeyBase64 } = await generateRecipientKeypair();

      // 2. Prepare input
      const input = {
        method: "POST" as const,
        url: `https://api.privy.io/v1/wallets/${walletId}/export`,
        version: 1 as const,
        body: {
          encryption_type: "HPKE",
          recipient_public_key: publicKeyBase64,
        },
      };

      const signature = generateAuthorizationSignature({
        input: {
          ...input,
          headers: { "privy-app-id": CONFIG.PRIVY.PRIVY_APP_ID },
        },
        authorizationPrivateKey: CONFIG.PRIVY.PRIVY_AUTH_PRIVATE_KEY,
      });

      const headers = {
        "privy-app-id": CONFIG.PRIVY.PRIVY_APP_ID?.trim(),
        "Content-Type": "application/json",
        "privy-authorization-signature": signature as string,
        "Authorization": "Basic " + Buffer.from(
          `${CONFIG.PRIVY.PRIVY_APP_ID}:${CONFIG.PRIVY.PRIVY_APP_SECRET}`
        ).toString("base64"),
      };

      // 3. Call Privy API
      const res = await fetch(input.url, {
        method: input.method,
        headers,
        body: JSON.stringify(input.body),
      });

      if (!res.ok) {
        throw new Error(`Export wallet failed: ${res.status} ${await res.text()}`);
      } 

      const response = await res.json();

      // 4. Decrypt the wallet data
      const decryptedData = await decryptHPKEMessage(
        privateKeyBase64,
        response.encapsulated_key,
        response.ciphertext
      );

      if (typeof decryptedData === 'string') {
        if (decryptedData.includes('error') || decryptedData.includes('Error') || decryptedData.includes('failed')) {
          throw new Error(`Privy returned error in decrypted data: ${decryptedData}`);
        }
      }

      let walletData;
      
      if (typeof decryptedData === 'string' && decryptedData.length > 50 && !decryptedData.includes('{') && !decryptedData.includes('"')) {

        walletData = {
          privateKey: decryptedData,
        };
      } else {
        try {
          walletData = JSON.parse(decryptedData);
        } catch (parseError) {
          throw new Error(`Failed to parse decrypted wallet data: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }
      }

      return {
        privateKey: walletData.privateKey || walletData.secretKey,
      };
    } catch (error) {
      console.error("Error exporting wallet:", error);
      throw new Error(
        `Failed to export wallet: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
