import type {
  Commitment,
  TransactionConfirmationStatus,
  SendOptions,
  Signer,
  Transaction,
  VersionedTransaction,
  SerializeConfig,
  BlockhashWithExpiryBlockHeight,
} from "@solana/web3.js";

export interface CreateSmartTransactionOptions {
  /** Optional separate fee payer. If not provided, the first signer will be used */
  feePayer?: Signer;
  /** Maximum priority fee (in microlamports) to pay for the transaction */
  priorityFeeCap?: number;
  /** Options for serializing legacy transactions:
   * - requireAllSignatures: Requires all signatures to be present (default: true)
   * - verifySignatures: Verifies provided signatures (default: true)
   */
  serializeOptions?: SerializeConfig;
  commitment?: Commitment;
}

export interface SendSmartTransactionOptions
  extends CreateSmartTransactionOptions,
    SendOptions {
  /** Number of blocks after the current block height that the transaction remains valid */
  lastValidBlockHeightOffset?: number;
  /** Maximum time in milliseconds to wait for transaction confirmation */
  pollTimeoutMs?: number;
  /** Time in milliseconds to wait between confirmation status checks */
  pollIntervalMs?: number;
  /** Time in milliseconds for each polling attempt before retrying transaction */
  pollChunkMs?: number;
}

export type SmartTransactionContext = {
  transaction: Transaction | VersionedTransaction;
  blockhash: BlockhashWithExpiryBlockHeight;
  minContextSlot: number;
};

export interface GetPriorityFeeEstimateParams {
  transaction?: string;
  accountKeys?: string[];
  options?: GetPriorityFeeEstimateOptions;
}

export enum PriorityLevel {
  MIN = "Min",
  LOW = "Low",
  MEDIUM = "Medium",
  HIGH = "High",
  VERY_HIGH = "VeryHigh",
  UNSAFE_MAX = "UnsafeMax",
  DEFAULT = "Default",
}

export enum UiTransactionEncoding {
  Binary = "binary",
  Base64 = "base64",
  Base58 = "base58",
  Json = "json",
  JsonParsed = "jsonParsed",
}

export interface GetPriorityFeeEstimateOptions {
  priorityLevel?: PriorityLevel;
  includeAllPriorityFeeLevels?: boolean;
  transactionEncoding?: UiTransactionEncoding;
  lookbackSlots?: number;
  recommended?: boolean;
}

export interface MicroLamportPriorityFeeLevels {
  min: number;
  low: number;
  medium: number;
  high: number;
  veryHigh: number;
  unsafeMax: number;
}

export interface GetPriorityFeeEstimateResponse {
  priorityFeeEstimate?: number;
  priorityFeeLevels?: MicroLamportPriorityFeeLevels;
}

export type SignedTransactionInput =
  | Transaction
  | VersionedTransaction
  | Buffer
  | string;

export type PollTransactionOptions = {
  confirmationStatuses?: TransactionConfirmationStatus[];
  // In milliseconds
  timeout?: number;
  // In milliseconds
  interval?: number;
  lastValidBlockHeight?: number;
};
