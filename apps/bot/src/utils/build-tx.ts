import {
  AddressLookupTableAccount,
  BlockhashWithExpiryBlockHeight,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  type CreateSmartTransactionOptions,
  type SendSmartTransactionOptions,
  type SmartTransactionContext,
  type GetPriorityFeeEstimateParams,
  type GetPriorityFeeEstimateResponse,
  type SignedTransactionInput,
  type PollTransactionOptions,
  PriorityLevel,
} from "@/types/transaction.types";

// https://jito-foundation.gitbook.io/mev/mev-payment-and-distribution/on-chain-addresses
export const JITO_TIP_ACCOUNTS: string[] = [
  // "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  // "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  // "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  // "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  // "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  // "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  // "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  // "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",

  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
];

export type JitoRegion = "Default" | "NY" | "Amsterdam" | "Frankfurt" | "Tokyo";
// https://jito-labs.gitbook.io/mev/searcher-resources/json-rpc-api-reference/url
export const JITO_API_URLS: Record<JitoRegion, string> = {
  Default: "https://mainnet.block-engine.jito.wtf:443",
  NY: "https://ny.mainnet.block-engine.jito.wtf",
  Amsterdam: "https://amsterdam.mainnet.block-engine.jito.wtf",
  Frankfurt: "https://frankfurt.mainnet.block-engine.jito.wtf",
  Tokyo: "https://tokyo.mainnet.block-engine.jito.wtf",
};

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

async function sendJitoBundle(
  serializedTransactions: string[],
  jitoApiUrl: string
): Promise<string> {
  try {
    const response = await fetch(jitoApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [serializedTransactions],
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        `Error sending bundles: ${JSON.stringify(data.error || data, null, 2)}`
      );
    }

    return data.result as string;
  } catch (error: any) {
    throw new Error(`Error sending bundles: ${error?.message || error}`);
  }
}

async function getBundleStatuses(
  bundleIds: string[],
  jitoApiUrl: string
): Promise<any> {
  try {
    const response = await fetch(jitoApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `panda-${Date.now()}`,
        method: "getBundleStatuses",
        params: [bundleIds],
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(
        `Error sending bundles: ${JSON.stringify(data.error || data, null, 2)}`
      );
    }

    return data.result;
  } catch (error) {
    throw new Error(`Error getting bundle statuses: ${error}`);
  }
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

  const existingComputeBudgetInstructions = instructions.filter(
    (instruction) =>
      instruction.programId.toBase58() ===
      ComputeBudgetProgram.programId.toBase58()
  );

  console.log(
    "existingComputeBudgetInstructions",
    existingComputeBudgetInstructions.length
  );

  if (existingComputeBudgetInstructions.length === 0) {
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
        options: { priorityLevel: PriorityLevel.HIGH },
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
  }

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
      throw new Error(
        "Error fetching compute units for the instructions provided"
      );
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
    pollTimeoutMs = 30_000, // 30s
    pollIntervalMs = 2000, // 2s
    pollChunkMs = 10000, // 10s
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
        console.log("-------> send raw success");
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

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs / 2));
        continue;
      }
    }
  } catch (error) {
    throw new Error(`Error broadcasting signed smart transaction: ${error}`);
  }
}

export async function sendSmartTransactionWithTip(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  blockhash: BlockhashWithExpiryBlockHeight,
  // instructions: TransactionInstruction[],
  // signers: Signer[],
  // lookupTables: AddressLookupTableAccount[] = [],
  // tipAmount: number = 1000,
  region: JitoRegion = "Default",
  options: SendSmartTransactionOptions = {}
): Promise<string> {
  const lastValidBlockHeightOffset = options.lastValidBlockHeightOffset ?? 150;
  if (lastValidBlockHeightOffset < 0)
    throw new Error("lastValidBlockHeightOffset must be a positive integer");

  const serializedTransaction = bs58.encode(transaction.serialize());

  // Get the Jito API URL for the specified region
  const jitoApiUrl = `${JITO_API_URLS[region]}/api/v1/bundles`;

  // Send the transaction as a Jito Bundle
  const bundleId = await sendJitoBundle([serializedTransaction], jitoApiUrl);

  const currentBlockHeight = await connection.getBlockHeight();
  const lastValidBlockHeight = Math.min(
    blockhash.lastValidBlockHeight,
    currentBlockHeight + lastValidBlockHeightOffset
  );

  // Poll for confirmation status
  const timeout = 60000; // 60 second timeout
  const interval = 5000; // 5 second interval
  const startTime = Date.now();

  while (
    Date.now() - startTime < timeout ||
    (await connection.getBlockHeight()) <= lastValidBlockHeight
  ) {
    const bundleStatuses = await getBundleStatuses([bundleId], jitoApiUrl);

    if (
      bundleStatuses &&
      bundleStatuses.value &&
      bundleStatuses.value.length > 0
    ) {
      const status = bundleStatuses.value[0].confirmation_status;

      if (status === "confirmed") {
        return bundleStatuses.value[0].transactions[0];
      }
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error("Bundle failed to confirm within the timeout period");
}

// tip
export async function createSmartTransactionWithTip(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers: Signer[],
  lookupTables: AddressLookupTableAccount[] = [],
  tipAmount: number = 1000,
  options: CreateSmartTransactionOptions = {}
): Promise<SmartTransactionContext> {
  // Select a random tip account
  const randomTipAccount =
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];

  // Set the fee payer and add the tip instruction
  const payerKey = options.feePayer ? options.feePayer.publicKey : payer;

  const tipInstruction = SystemProgram.transfer({
    fromPubkey: payerKey,
    toPubkey: new PublicKey(randomTipAccount),
    lamports: tipAmount,
  });

  instructions.push(tipInstruction);

  return createSmartTransaction(
    connection,
    instructions,
    payer,
    signers,
    lookupTables,
    options
  );
}

// v222222

const TIP_ACCOUNTS = [
  "4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE",
  "D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ",
  "9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta",
  "5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn",
  "2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD",
  "2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ",
  "wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF",
  "3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT",
  "4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey",
  "4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or",
];

async function getDynamicTipAmount(): Promise<number> {
  try {
    const response = await fetch(
      "https://bundles.jito.wtf/api/v1/bundles/tip_floor"
    );
    const data = await response.json();

    if (
      data &&
      data[0] &&
      typeof data[0].landed_tips_75th_percentile === "number"
    ) {
      const tip75th = data[0].landed_tips_75th_percentile;
      // Use 75th percentile but minimum 0.001 SOL
      return Math.max(tip75th, 0.001);
    }

    // Fallback if API fails or data is invalid
    return 0.001;
  } catch (error) {
    console.warn("Failed to fetch dynamic tip amount, using fallback:", error);
    return 0.001; // Fallback to minimum
  }
}

export async function createTransactionSender(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers: Signer[]
): Promise<SmartTransactionContext> {
  // Validate user hasn't included compute budget instructions
  const hasComputeBudget = instructions.some((ix) =>
    ix.programId.equals(ComputeBudgetProgram.programId)
  );

  if (hasComputeBudget) {
    throw new Error(
      "Do not include compute budget instructions - they are added automatically"
    );
  }

  // Create copy of instructions to avoid modifying the original array
  const allInstructions = [...instructions];

  // Get dynamic tip amount from Jito API (75th percentile, minimum 0.001 SOL)
  const tipAmountSOL = await getDynamicTipAmount();
  const tipAccount = new PublicKey(
    TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]
  );

  console.log(`Using dynamic tip amount: ${tipAmountSOL} SOL`);

  allInstructions.push(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: tipAccount,
      lamports: tipAmountSOL * LAMPORTS_PER_SOL,
    })
  );

  // Get recent blockhash with context (Helius best practice)
  const {
    value: blockhashInfo,
    context: { slot: minContextSlot },
  } = await connection.getLatestBlockhashAndContext("confirmed");
  const { blockhash, lastValidBlockHeight } = blockhashInfo;

  // Simulate transaction to get compute units
  const testInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...allInstructions,
  ];

  const testTransaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: testInstructions,
      payerKey: payer,
      recentBlockhash: blockhash,
    }).compileToV0Message()
  );
  testTransaction.sign(signers);

  const simulation = await connection.simulateTransaction(testTransaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  if (!simulation.value.unitsConsumed) {
    throw new Error("Simulation failed to return compute units");
  }

  // Set compute unit limit with minimum 1000 CUs and 10% margin (Helius best practice)
  const units = simulation.value.unitsConsumed;
  const computeUnits = units < 1000 ? 1000 : Math.ceil(units * 1.2);

  // Get dynamic priority fee from Helius Priority Fee API
  const priorityFee = await getPriorityFee(
    connection,
    allInstructions,
    payer,
    blockhash
  );

  console.log("xxxx priorityFee", priorityFee);

  // Add compute budget instructions at the BEGINNING (must be first)
  allInstructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
  );
  allInstructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits })
  );

  // Build final optimized transaction
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: allInstructions,
      payerKey: payer,
      recentBlockhash: blockhash,
    }).compileToV0Message()
  );
  transaction.sign(signers);

  // Send via Sender endpoint with retry logic
  return {
    transaction,
    blockhash: { blockhash, lastValidBlockHeight },
    minContextSlot,
  };
}

export async function sendWithSender(
  connection: Connection,
  instructions: TransactionInstruction[],
  payer: PublicKey,
  signers: Signer[]
): Promise<string> {
  // const connection = new Connection(
  //   "https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY"
  // );

  // Validate user hasn't included compute budget instructions
  const hasComputeBudget = instructions.some((ix) =>
    ix.programId.equals(ComputeBudgetProgram.programId)
  );

  if (hasComputeBudget) {
    throw new Error(
      "Do not include compute budget instructions - they are added automatically"
    );
  }

  // Create copy of instructions to avoid modifying the original array
  const allInstructions = [...instructions];

  // Get dynamic tip amount from Jito API (75th percentile, minimum 0.001 SOL)
  const tipAmountSOL = await getDynamicTipAmount();
  const tipAccount = new PublicKey(
    TIP_ACCOUNTS[Math.floor(Math.random() * TIP_ACCOUNTS.length)]
  );

  console.log(`Using dynamic tip amount: ${tipAmountSOL} SOL`);

  allInstructions.push(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: tipAccount,
      lamports: tipAmountSOL * LAMPORTS_PER_SOL,
    })
  );

  // Get recent blockhash with context (Helius best practice)
  const { value: blockhashInfo } =
    await connection.getLatestBlockhashAndContext("confirmed");
  const { blockhash, lastValidBlockHeight } = blockhashInfo;

  // Simulate transaction to get compute units
  const testInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    ...allInstructions,
  ];

  const testTransaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: testInstructions,
      payerKey: payer,
      recentBlockhash: blockhash,
    }).compileToV0Message()
  );
  testTransaction.sign(signers);

  const simulation = await connection.simulateTransaction(testTransaction, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  });

  if (!simulation.value.unitsConsumed) {
    throw new Error("Simulation failed to return compute units");
  }

  // Set compute unit limit with minimum 1000 CUs and 10% margin (Helius best practice)
  const units = simulation.value.unitsConsumed;
  const computeUnits = units < 1000 ? 1000 : Math.ceil(units * 1.1);

  // Get dynamic priority fee from Helius Priority Fee API
  const priorityFee = await getPriorityFee(
    connection,
    allInstructions,
    payer,
    blockhash
  );

  // Add compute budget instructions at the BEGINNING (must be first)
  allInstructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee })
  );
  allInstructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits })
  );

  // Build final optimized transaction
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: allInstructions,
      payerKey: payer,
      recentBlockhash: blockhash,
    }).compileToV0Message()
  );
  transaction.sign(signers);

  // Send via Sender endpoint with retry logic
  return await sendWithRetry(transaction, connection, lastValidBlockHeight);
}

async function getPriorityFee(
  connection: Connection,
  instructions: TransactionInstruction[],
  payerKey: PublicKey,
  blockhash: string
): Promise<number> {
  try {
    const tempTx = new VersionedTransaction(
      new TransactionMessage({
        instructions,
        payerKey,
        recentBlockhash: blockhash,
      }).compileToV0Message()
    );

    const response = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: bs58.encode(tempTx.serialize()),
            options: {
              //  recommended: true
              priorityLevel: PriorityLevel.HIGH,
            },
          },
        ],
      }),
    });

    const data = await response.json();
    return data.result?.priorityFeeEstimate
      ? Math.ceil(data.result.priorityFeeEstimate * 1.2)
      : 50_000;
  } catch {
    return 50_000; // Fallback fee
  }
}

export async function sendWithRetry(
  transaction: VersionedTransaction | Transaction,
  connection: Connection,
  lastValidBlockHeight: number
): Promise<string> {
  const maxRetries = 3;
  // Frontend: Use HTTPS endpoint to avoid CORS issues
  // const endpoint = "https://sender.helius-rpc.com/fast";
  // Backend: Use regional HTTP endpoint closest to your servers
  const endpoint = "http://slc-sender.helius-rpc.com/fast";

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Check blockhash validity
      const currentHeight = await connection.getBlockHeight("confirmed");
      if (currentHeight > lastValidBlockHeight) {
        throw new Error("Blockhash expired");
      }

      // Send transaction via Sender endpoint
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now().toString(),
          method: "sendTransaction",
          params: [
            Buffer.from(transaction.serialize()).toString("base64"),
            {
              encoding: "base64",
              skipPreflight: true, // Required for Sender
              maxRetries: 0, // Implement your own retry logic
            },
          ],
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message);

      console.log(`Transaction sent: ${result.result}`);
      return await confirmTransaction(result.result, connection);
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw new Error("All retry attempts failed");
}

async function confirmTransaction(
  signature: string,
  connection: Connection
): Promise<string> {
  const timeout = 15000;
  const interval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const status = await connection.getSignatureStatuses([signature]);
      if (status?.value[0]?.confirmationStatus === "confirmed") {
        return signature;
      }
    } catch (error) {
      console.warn("Status check failed:", error);
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Transaction confirmation timeout: ${signature}`);
}

// Example usage following standard Helius docs pattern
// export async function exampleUsage() {
//   const keypair = Keypair.fromSecretKey(
//     new Uint8Array([
//       /* your secret key */
//     ])
//   );

//   // 1. Prepare your transaction instructions (USER ADDS THEIR INSTRUCTIONS HERE)
//   const instructions: TransactionInstruction[] = [
//     SystemProgram.transfer({
//       fromPubkey: keypair.publicKey,
//       toPubkey: new PublicKey("RECIPIENT_ADDRESS"),
//       lamports: 0.1 * LAMPORTS_PER_SOL,
//     }),
//     // Add more instructions as needed
//   ];

//   // 2. Send with Sender (automatically adds tip + optimizations)
//   try {
//     const signature = await sendWithSender(keypair, instructions, connection);
//     console.log(`Successful transaction: ${signature}`);
//   } catch (error) {
//     console.error("Transaction failed:", error);
//   }
// }
