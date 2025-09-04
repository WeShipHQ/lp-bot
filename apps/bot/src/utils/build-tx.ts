import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import type {
  CreateSmartTransactionOptions,
  SendSmartTransactionOptions,
  SmartTransactionContext,
  GetPriorityFeeEstimateParams,
  GetPriorityFeeEstimateResponse,
  SignedTransactionInput,
  PollTransactionOptions,
} from "@/types/transaction.types";

async function getPriorityFeeEstimate(
  connection: Connection,
  params: GetPriorityFeeEstimateParams
): Promise<GetPriorityFeeEstimateResponse> {
  try {
    const url = connection.rpcEndpoint;

    if (url.includes("devnet") || url.includes("testnet")) {
      return {
        priorityFeeEstimate: 1000, // 0.001 SOL
      } as GetPriorityFeeEstimateResponse;
    }

    const id = `tx-${Date.now()}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "getPriorityFeeEstimate",
        params: [params],
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        `Error fetching priority fee estimate: ${JSON.stringify(
          data.error || data,
          null,
          2
        )}`
      );
    }

    return data.result as GetPriorityFeeEstimateResponse;
  } catch (error: any) {
    throw new Error(
      `Error fetching priority fee estimate: ${error?.message || error}`
    );
  }
}

async function getComputeUnits(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  lookupTables: AddressLookupTableAccount[],
  signers?: Signer[]
): Promise<number | null> {
  const testInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...instructions,
  ];

  const testTransaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: testInstructions,
      payerKey: payer,
      recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
    }).compileToV0Message(lookupTables)
  );

  if (signers) {
    testTransaction.sign(signers);
  }

  const rpcResponse = await connection.simulateTransaction(testTransaction, {
    sigVerify: !!signers,
  });

  if (rpcResponse.value.err) {
    console.error(
      `Simulation error: ${JSON.stringify(rpcResponse.value.err, null, 2)}`
    );
    return null;
  }

  return rpcResponse.value.unitsConsumed || null;
}

export async function createSmartTransaction(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers: Signer[] = [],
  lookupTables: AddressLookupTableAccount[] = [],
  options: CreateSmartTransactionOptions = {}
): Promise<SmartTransactionContext> {
  const { feePayer, priorityFeeCap } = options;

  const existingComputeBudgetInstructions = instructions.filter((instruction) =>
    instruction.programId.equals(ComputeBudgetProgram.programId)
  );

  // if (existingComputeBudgetInstructions.length > 0) {
  //   throw new Error(
  //     "Cannot provide instructions that set the compute unit price and/or limit"
  //   );
  // }

  // Determine the fee payer key (override if provided)
  const payerKey = feePayer ? feePayer.publicKey : payer;

  const {
    context: { slot: minContextSlot },
    value: blockhash,
  } = await connection.getLatestBlockhashAndContext(
    options.commitment || "confirmed"
  );
  const recentBlockhash = blockhash.blockhash;
  const isVersioned = lookupTables.length > 0;

  // Build the initial unsigned tx
  let transaction: Transaction | VersionedTransaction;

  if (isVersioned) {
    const v0Message = new TransactionMessage({
      instructions,
      payerKey,
      recentBlockhash,
    }).compileToV0Message(lookupTables);
    transaction = new VersionedTransaction(v0Message);
  } else {
    transaction = new Transaction().add(...instructions);
    transaction.recentBlockhash = recentBlockhash;
    transaction.feePayer = payerKey;
  }

  // Serialize the unsigned tx
  const serializedTransaction = bs58.encode(
    // @ts-ignore
    isVersioned
      ? (transaction as VersionedTransaction).serialize()
      : (transaction as Transaction).serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
  );

  // Get priority fee estimate
  let priorityFeeResponse;
  if (
    connection.rpcEndpoint.includes("devnet") ||
    connection.rpcEndpoint.includes("testnet")
  ) {
    // For devnet, we use a fixed priority fee
    priorityFeeResponse = {
      priorityFeeEstimate: 1000, // 0.001 SOL
      priorityFeeCap: 1000, // 0.001 SOL
    } as GetPriorityFeeEstimateResponse;
  } else {
    priorityFeeResponse = await getPriorityFeeEstimate(connection, {
      transaction: serializedTransaction,
      options: { recommended: true },
    });
  }

  console.log("priorityFeeResponse", priorityFeeResponse);

  const { priorityFeeEstimate } = priorityFeeResponse;

  if (!priorityFeeEstimate) {
    throw new Error("Priority fee estimate not available");
  }

  // Adjust priority fee based on the cap
  let adjustedPriorityFee = priorityFeeEstimate;

  if (priorityFeeCap !== undefined) {
    adjustedPriorityFee = Math.min(priorityFeeEstimate, priorityFeeCap);
  }

  const computeBudgetPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: adjustedPriorityFee,
  });
  instructions.unshift(computeBudgetPriceIx);

  if (existingComputeBudgetInstructions.length === 0) {
    // Simulate the tx to get the CUs consumed
    let units = await getComputeUnits(
      connection,
      instructions,
      payerKey,
      lookupTables
    );
    console.log("compute unit", units);

    if (!units) {
      // throw new Error(
      //   "Error fetching compute units for the instructions provided"
      // );
      console.warn(
        "Error fetching compute units for the instructions provided, defaulting to 1_400_000"
      );
      units = 800_000;
    }

    // For very small transactions, default to 1,000 CUs; otherwise, add a 10% margin
    const customersCU = units < 1000 ? 1000 : Math.ceil(units * 1.1);
    const computeUnitsIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: customersCU,
    });
    instructions.unshift(computeUnitsIx);
  }

  // Rebuild the final unsigned tx
  if (isVersioned) {
    const v0Message = new TransactionMessage({
      instructions,
      payerKey,
      recentBlockhash,
    }).compileToV0Message(lookupTables);

    transaction = new VersionedTransaction(v0Message);
    if (signers.length > 0) {
      transaction.sign(signers);
    }
  } else {
    transaction = new Transaction().add(...instructions);
    transaction.recentBlockhash = recentBlockhash;
    transaction.feePayer = payerKey;
    if (signers.length > 0) {
      transaction.partialSign(...signers);
    }
  }

  // Use the wallet adapter's signTransaction function to sign the tx
  // const signedTransaction = await signTransaction(transaction);

  return {
    transaction,
    blockhash,
    minContextSlot,
  };
}

async function pollTransactionConfirmation(
  connection: Connection,
  txtSig: TransactionSignature,
  pollOptions: PollTransactionOptions = {}
): Promise<TransactionSignature> {
  const {
    confirmationStatuses = ["confirmed", "finalized"],
    timeout = 60000,
    interval = 2000,
    lastValidBlockHeight,
  } = pollOptions;

  if (lastValidBlockHeight) {
    const currentHeight = await connection.getBlockHeight();

    if (lastValidBlockHeight - currentHeight > 150) {
      throw new Error(
        `Provided lastValidBlockHeight (${lastValidBlockHeight}) is more than 150 blocks from the current chain height (${currentHeight})`
      );
    }
  }

  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Transaction ${txtSig} not confirmed within ${timeout}ms`
      );
    }

    if (lastValidBlockHeight) {
      const currentHeight = await connection.getBlockHeight();

      if (currentHeight > lastValidBlockHeight) {
        const finalStatus = await connection.getSignatureStatus(txtSig);
        if (
          finalStatus?.value?.confirmationStatus &&
          confirmationStatuses.includes(finalStatus.value.confirmationStatus)
        ) {
          // The tx was confirmed at the boundary
          return txtSig;
        }
        throw new Error(
          `Block height has exceeded lastValidBlockHeight for tx ${txtSig}, and it was not found in a confirmed block.`
        );
      }
    }

    const status = await connection.getSignatureStatus(txtSig);

    if (status?.value) {
      const { confirmationStatus, err } = status.value;

      if (err) {
        throw new Error(
          `Transaction ${txtSig} failed on-chain with error: ${JSON.stringify(
            err
          )}`
        );
      }

      // If confirmed or finalized, we can stop
      if (
        confirmationStatus &&
        confirmationStatuses.includes(confirmationStatus)
      ) {
        return txtSig;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

export async function broadcastTransaction(
  connection: Connection,
  transaction: SignedTransactionInput,
  options: SendSmartTransactionOptions = {}
): Promise<string> {
  const {
    lastValidBlockHeightOffset = 150,
    pollTimeoutMs = 60000,
    pollIntervalMs = 2000,
    pollChunkMs = 10000,
    skipPreflight = false,
    preflightCommitment = "confirmed",
    maxRetries = 0,
  } = options;

  if (lastValidBlockHeightOffset < 0) {
    throw new Error("lastValidBlockHeightOffset must be a positive integer");
  }

  let serializedTx: Buffer;
  let recentBlockhash: string | undefined;

  try {
    if (transaction instanceof Transaction) {
      serializedTx = transaction.serialize();
      recentBlockhash = transaction.recentBlockhash;
    } else if (transaction instanceof VersionedTransaction) {
      serializedTx = Buffer.from(transaction.serialize());
      recentBlockhash = transaction.message.recentBlockhash;
    } else if (Buffer.isBuffer(transaction)) {
      serializedTx = transaction;
      recentBlockhash = undefined; // Cannot extract
    } else if (typeof transaction === "string") {
      serializedTx = Buffer.from(transaction, "base64");
      recentBlockhash = undefined; // Cannot extract
    } else {
      throw new Error("Unsupported transaction input type.");
    }

    // Fallback to latest blockhash info if none is present
    if (!recentBlockhash) {
      console.warn(
        "No recentBlockhash found in serialized transaction; using latest blockhash info"
      );
    }

    const blockhashInfo =
      await connection.getLatestBlockhash(preflightCommitment);
    const currentBlockHeight = await connection.getBlockHeight();
    const lastValidBlockHeight = Math.min(
      blockhashInfo.lastValidBlockHeight,
      currentBlockHeight + lastValidBlockHeightOffset
    );

    const startTime = Date.now();
    let attemptCount = 0;
    let signature: string;

    while (true) {
      if (Date.now() - startTime > pollTimeoutMs) {
        throw new Error(`Transaction not confirmed after ${pollTimeoutMs}ms`);
      }

      attemptCount++;

      try {
        signature = await connection.sendRawTransaction(serializedTx, {
          skipPreflight,
          preflightCommitment,
          maxRetries,
        });
      } catch (sendError) {
        console.warn(
          `sendRawTransaction attempt ${attemptCount} failed: ${sendError}`
        );
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      try {
        const confirmedSig = await pollTransactionConfirmation(
          connection,
          signature,
          {
            timeout: pollChunkMs,
            interval: pollIntervalMs,
            confirmationStatuses: ["confirmed", "finalized"],
            lastValidBlockHeight,
          }
        );
        return confirmedSig;
      } catch (pollError: any) {
        if (
          pollError.message.includes("Block height has exceeded") ||
          pollError.message.includes("failed on-chain")
        ) {
          throw pollError;
        }

        console.warn(
          `pollTransactionConfirmation timed out, attempt #${attemptCount}. Retrying...`
        );

        const status = await connection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus && !status.value.err) {
          const { confirmationStatus } = status.value;
          if (["confirmed", "finalized"].includes(confirmationStatus)) {
            console.info(
              `Transaction ${signature} was confirmed despite polling failure. Returning successful`
            );
            return signature;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }
    }
  } catch (error) {
    throw new Error(`Error broadcasting signed smart transaction: ${error}`);
  }
}

// interface CreateTransactionsParams {
//   commitment?: Commitment;
//   onSuccess?: (txId: string, idx: number) => Promise<void>;
//   onError?: (reason: string, idx: number) => Promise<boolean>;
//   blockhash?: Blockhash;
//   maxRetries?: number;
//   stopOnError?: boolean;
// }

// export const createAndSendTransactions = async (
//   connection: Connection,
//   payer: PublicKey,
//   signAllTransactions: SignerWalletAdapterProps["signAllTransactions"],
//   instructionSet: TransactionInstruction[][],
//   signersSet: Keypair[][],
//   {
//     maxRetries = 3,
//     onSuccess,
//     onError,
//     stopOnError,
//   }: CreateTransactionsParams = {}
// ) => {
//   const transactions: Transaction[] = [];

//   const {
//     context: { slot: minContextSlot },
//     value: { blockhash },
//   } = await connection.getLatestBlockhashAndContext("finalized");

//   for (let i = 0; i < instructionSet.length; i++) {
//     const instructions = instructionSet[i] ?? [];
//     if (instructions.length === 0) {
//       continue;
//     }
//     const transaction = new Transaction({ feePayer: payer });
//     transaction.add(...instructions);
//     transaction.recentBlockhash = blockhash;
//     const signers = signersSet[i] ?? [];
//     if (signers.length > 0) {
//       transaction.partialSign(...signers);
//     }
//     transactions.push(transaction);
//   }

//   const signedTransactions = await signAllTransactions(transactions);
//   const pendingTransactions: Promise<string>[] = [];

//   let i = 0;
//   for (const signedTransaction of signedTransactions) {
//     const rawTransaction = signedTransaction.serialize();

//     const pendingTransaction = connection.sendRawTransaction(rawTransaction, {
//       skipPreflight: true,
//       maxRetries,
//       minContextSlot,
//       preflightCommitment: "confirmed",
//     } as SendOptions);

//     try {
//       const txId = await pendingTransaction;
//       console.log(`TX(#${i}) Signature:`, txId);
//       if (i === transactions.length - 1) {
//         if (onSuccess) {
//           await onSuccess(txId, i);
//         }
//       }
//     } catch (e: any) {
//       console.log(`TX(#${i}) Error:`, e);
//       if (onError) {
//         await onError(e, i);
//       }
//       if (stopOnError) {
//         return await Promise.all(pendingTransactions);
//       }
//     }

//     pendingTransactions.push(pendingTransaction);
//     i++;
//   }

//   return await Promise.all(pendingTransactions);
// };
