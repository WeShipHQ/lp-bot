import {
  Connection,
  PublicKey,
  Signer,
  TransactionInstruction,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import { CONFIG } from "@/config";
// import { CreateSmartTransactionOptions } from "@/types/transaction.types";
import { createTransactionSender } from "@/utils/build-tx";

export interface SanctumGatewayOptions {
  /** Override project-level CU price range */
  cuPriceRange?: "low" | "medium" | "high";
  /** Override project-level Jito tip range */
  jitoTipRange?: "low" | "medium" | "high" | "max";
  /** Transaction expiry in slots */
  expireInSlots?: number;
  /** Force specific delivery method */
  deliveryMethodType?: "rpc" | "jito" | "sanctum-sender" | "helius-sender";
  /** Skip transaction simulation */
  skipSimulation?: boolean;
  /** Skip priority fee optimization */
  skipPriorityFee?: boolean;
}

export interface SanctumGatewayResponse {
  transaction: string;
  latestBlockhash: {
    blockhash: string;
    lastValidBlockHeight: string;
  };
}

export interface SanctumSendResponse {
  jsonrpc: "2.0";
  id: string;
  result?: string;
  error?: {
    code: number;
    message: string;
  };
}

export class SanctumGatewayService {
  private static readonly GATEWAY_BASE_URL = "https://tpg.sanctum.so";

  static async buildGatewayTransaction(
    connection: Connection,
    instructions: TransactionInstruction[],
    payer: PublicKey,
    signers: Signer[] = [],
    gatewayOptions: SanctumGatewayOptions = {}
  ): Promise<{
    transaction: VersionedTransaction;
    latestBlockhash: { blockhash: string; lastValidBlockHeight: number };
  }> {
    console.log(`[SanctumGateway] Building optimized transaction`);

    const filteredIxs = instructions.filter(
      (ix) =>
        !ix.programId
          .toString()
          .startsWith("ComputeBudget11111111111111111111111111111")
    );

    if (filteredIxs.length === 0) {
      throw new Error(
        "Do not include compute budget instructions - they are added automatically"
      );
    }

    const allInstructions = [...filteredIxs];

    const { value: blockhashInfo } =
      await connection.getLatestBlockhashAndContext("confirmed");
    const { blockhash } = blockhashInfo;

    const baseTransaction = new VersionedTransaction(
      new TransactionMessage({
        instructions: allInstructions,
        payerKey: payer,
        recentBlockhash: blockhash,
      }).compileToV0Message()
    );

    baseTransaction.sign(signers);

    // const { transaction: baseTransaction } = await createTransactionSender(
    //   connection,
    //   instructions,
    //   payer,
    //   signers
    // );

    const base64Tx = Buffer.from(baseTransaction.serialize()).toString(
      "base64"
    );

    const response = await fetch(
      `${this.GATEWAY_BASE_URL}/v1/${CONFIG.SOLANA.NETWORK}?apiKey=${CONFIG.SANCTUM.API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: `build-${Date.now()}`,
          jsonrpc: "2.0",
          method: "buildGatewayTransaction",
          params: [
            base64Tx,
            {
              encoding: "base64",
              skipSimulation: gatewayOptions.skipSimulation || false,
              skipPriorityFee: gatewayOptions.skipPriorityFee || false,
              ...(gatewayOptions.cuPriceRange
                ? { cuPriceRange: gatewayOptions.cuPriceRange }
                : {}),
              ...(gatewayOptions.jitoTipRange
                ? { jitoTipRange: gatewayOptions.jitoTipRange }
                : {}),
              ...(gatewayOptions.expireInSlots
                ? { expireInSlots: gatewayOptions.expireInSlots }
                : {}),
              ...(gatewayOptions.deliveryMethodType
                ? { deliveryMethodType: gatewayOptions.deliveryMethodType }
                : {}),
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gateway build failed: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as {
      result?: SanctumGatewayResponse;
      error?: any;
    };

    if (data.error || !data.result) {
      throw new Error(`Gateway build error: ${JSON.stringify(data.error)}`);
    }

    const optimizedTx = VersionedTransaction.deserialize(
      Buffer.from(data.result.transaction, "base64")
    );

    if (signers.length > 0) {
      optimizedTx.sign(signers);
    }

    return {
      transaction: optimizedTx,
      latestBlockhash: {
        blockhash: data.result.latestBlockhash.blockhash,
        lastValidBlockHeight: parseInt(
          data.result.latestBlockhash.lastValidBlockHeight
        ),
      },
    };
  }

  static async sendTransaction(
    signedTransaction: Transaction | VersionedTransaction,
    startSlot?: number
  ): Promise<string> {
    console.log(`[SanctumGateway] Sending transaction via Gateway`);

    const base64Tx = Buffer.from(signedTransaction.serialize()).toString(
      "base64"
    );

    const response = await fetch(
      `${this.GATEWAY_BASE_URL}/v1/${CONFIG.SOLANA.NETWORK}?apiKey=${CONFIG.SANCTUM.API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: `send-${Date.now()}`,
          jsonrpc: "2.0",
          method: "sendTransaction",
          params: [
            base64Tx,
            {
              encoding: "base64",
              startSlot,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gateway send failed: ${response.status} ${await response.text()}`
      );
    }

    const data = (await response.json()) as SanctumSendResponse;

    if (data.error) {
      throw new Error(
        `Gateway send error: ${data.error.message} (code: ${data.error.code})`
      );
    }

    if (!data.result) {
      throw new Error("Gateway returned no transaction signature");
    }

    console.log(`[SanctumGateway] Transaction sent: ${data.result}`);
    return data.result;
  }

  static async getTipInstructions(
    feePayer: PublicKey,
    gatewayOptions: SanctumGatewayOptions = {}
  ): Promise<TransactionInstruction[]> {
    console.log(`[SanctumGateway] Getting tip instructions`);

    const response = await fetch(
      `${this.GATEWAY_BASE_URL}/v1/${CONFIG.SOLANA.NETWORK}?apiKey=${CONFIG.SANCTUM.API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: `tip-${Date.now()}`,
          jsonrpc: "2.0",
          method: "getTipInstructions",
          params: [
            {
              feePayer: feePayer.toBase58(),
              jitoTipRange: gatewayOptions.jitoTipRange,
              deliveryMethodType: gatewayOptions.deliveryMethodType,
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Gateway tip instructions failed: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Gateway tip error: ${JSON.stringify(data.error)}`);
    }

    return data.result.map((ix: any) => ({
      keys: ix.accounts.map((acc: any) => ({
        pubkey: new PublicKey(acc.pubkey),
        isSigner: acc.isSigner,
        isWritable: acc.isWritable,
      })),
      programId: new PublicKey(ix.programId),
      data: Buffer.from(ix.data),
    }));
  }

  static async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.GATEWAY_BASE_URL}/v1/${CONFIG.SOLANA.NETWORK}?apiKey=${CONFIG.SANCTUM.API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: `health-${Date.now()}`,
            jsonrpc: "2.0",
            method: "getTipInstructions",
            params: [{ feePayer: "11111111111111111111111111111111112" }],
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error("[SanctumGateway] Health check failed:", error);
      return false;
    }
  }
}
