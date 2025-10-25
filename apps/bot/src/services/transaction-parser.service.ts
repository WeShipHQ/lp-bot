import { Connection, ParsedTransaction } from "@solana/web3.js";
import { 
  parseMeteoraInstructions,
  MeteoraDlmmInstruction,
} from "@/utils/tx-parser";
import { 
  TransactionMetadata,
  parseTransactionMetadata,
  isCreatePositionMetadata,
  isClaimFeesMetadata,
  isClosePositionMetadata,
} from "@/types/transaction-metadata.types";
import { logger } from "@/utils/logger";
import Decimal from "decimal.js";
import { 
  lamportsToUi,
  rawToUiAmount,
  truncateUSD,
  truncateSOL,
  truncateToken,
  truncatePrice,
  truncatePercentage,
} from "@/utils/number-utils";

/**
 * Service for parsing blockchain transactions and extracting structured data
 */
export class TransactionParserService {
  constructor(private readonly connection: Connection) {}

  /**
   * Parses transaction and extracts operation-specific data
   */
  async parseTransaction(signature: string): Promise<ParsedTransactionData> {
    try {
      // Get parsed transaction from Solana
      const parsedTx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!parsedTx) {
        throw new Error(`Unable to parse transaction ${signature}`);
      }

      // Parse Meteora instructions
      const instructions = parseMeteoraInstructions(parsedTx);
      
      // Get metadata to determine operation type
      const metadata = parseTransactionMetadata(parsedTx.meta?.innerInstructions?.[0]?.data?.toString());
      
      if (!metadata) {
        throw new Error(`No metadata found in transaction ${signature}`);
      }

      // Route to appropriate parser based on operation type
      if (isCreatePositionMetadata(metadata)) {
        return this.parseCreatePosition(signature, instructions, metadata as any);
      }
      
      if (isClaimFeesMetadata(metadata)) {
        return this.parseClaimFees(signature, instructions, metadata as any);
      }
      
      if (isClosePositionMetadata(metadata)) {
        return this.parseClosePosition(signature, instructions, metadata as any);
      }

      throw new Error(`Unknown operation type in transaction ${signature}`);
    } catch (error) {
      logger.error("Failed to parse transaction", { signature, error });
      throw error;
    }
  }

  /**
   * Parses CREATE_POSITION transaction data
   */
  private parseCreatePosition(
    signature: string,
    instructions: MeteoraDlmmInstruction[],
    metadata: any
  ): ParsedTransactionData {
    const initializeInstruction = instructions.find(ix => ix.instructionType === "open");
    const addLiquidityInstruction = instructions.find(ix => ix.instructionType === "add");

    if (!initializeInstruction || !addLiquidityInstruction) {
      throw new Error("Missing required instructions for position creation");
    }

    // Extract position address
    const positionAddress = 
      metadata.positionAddress || 
      initializeInstruction.accounts.position;

    // Extract actual token amounts from transfers
    const tokenATransfer = addLiquidityInstruction.tokenTransfers?.find(
      t => t.mint === metadata.tokenAMint
    );
    const tokenBTransfer = addLiquidityInstruction.tokenTransfers?.find(
      t => t.mint === metadata.tokenBMint
    );

    const tokenAAmount = tokenATransfer 
      ? rawToUiAmount(tokenATransfer.amount, metadata.tokenADecimals)
      : "0";
    const tokenBAmount = tokenBTransfer 
      ? rawToUiAmount(tokenBTransfer.amount, metadata.tokenBDecimals)
      : "0";

    return {
      signature,
      operationType: "CREATE_POSITION",
      metadata,
      extractedData: {
        positionAddress,
        tokenAAmount,
        tokenBAmount,
        strategy: metadata.strategy,
        depositMethod: metadata.depositMethod,
        autoRebalance: metadata.autoRebalance,
        slippage: metadata.slippage,
      },
    };
  }

  /**
   * Parses CLAIM_FEES transaction data
   */
  private parseClaimFees(
    signature: string,
    instructions: MeteoraDlmmInstruction[],
    metadata: any
  ): ParsedTransactionData {
    const claimInstructions = instructions.filter(ix => ix.instructionType === "claim");

    if (claimInstructions.length === 0) {
      throw new Error("No claim instructions found in transaction");
    }

    // Aggregate token transfers from all claim instructions
    const aggregateTransfers = new Map<string, number>();
    for (const instruction of claimInstructions) {
      for (const transfer of instruction.tokenTransfers ?? []) {
        const current = aggregateTransfers.get(transfer.mint) ?? 0;
        aggregateTransfers.set(transfer.mint, current + transfer.amount);
      }
    }

    const tokenAAmount = aggregateTransfers.get(metadata.tokenAMint) 
      ? rawToUiAmount(aggregateTransfers.get(metadata.tokenAMint)!, metadata.tokenADecimals)
      : "0";
    const tokenBAmount = aggregateTransfers.get(metadata.tokenBMint) 
      ? rawToUiAmount(aggregateTransfers.get(metadata.tokenBMint)!, metadata.tokenBDecimals)
      : "0";

    return {
      signature,
      operationType: "CLAIM_FEES",
      metadata,
      extractedData: {
        positionId: metadata.positionId,
        tokenAAmount,
        tokenBAmount,
        convertToSol: metadata.convertToSol,
        estimatedFeesUsd: metadata.estimatedFeesUsd,
      },
    };
  }

  /**
   * Parses CLOSE_POSITION transaction data
   */
  private parseClosePosition(
    signature: string,
    instructions: MeteoraDlmmInstruction[],
    metadata: any
  ): ParsedTransactionData {
    const closeInstruction = instructions.find(ix => ix.instructionType === "close");
    const removeInstructions = instructions.filter(ix => ix.instructionType === "remove");

    if (!closeInstruction) {
      throw new Error("Missing close instruction in transaction");
    }

    // Extract position address
    const positionAddress = 
      metadata.positionAddress || 
      closeInstruction.accounts.position;

    // Aggregate token transfers from remove instructions
    const aggregateTransfers = new Map<string, number>();
    for (const instruction of removeInstructions) {
      for (const transfer of instruction.tokenTransfers ?? []) {
        const current = aggregateTransfers.get(transfer.mint) ?? 0;
        aggregateTransfers.set(transfer.mint, current + transfer.amount);
      }
    }

    const tokenAAmount = aggregateTransfers.get(metadata.tokenAMint) 
      ? rawToUiAmount(aggregateTransfers.get(metadata.tokenAMint)!, metadata.tokenADecimals)
      : "0";
    const tokenBAmount = aggregateTransfers.get(metadata.tokenBMint) 
      ? rawToUiAmount(aggregateTransfers.get(metadata.tokenBMint)!, metadata.tokenBDecimals)
      : "0";

    return {
      signature,
      operationType: "CLOSE_POSITION",
      metadata,
      extractedData: {
        positionId: metadata.positionId,
        tokenAAmount,
        tokenBAmount,
        closureReason: metadata.closureReason,
      },
    };
  }
}

/**
 * Result of transaction parsing
 */
export interface ParsedTransactionData {
  signature: string;
  operationType: string;
  metadata: TransactionMetadata;
  extractedData: {
    positionAddress?: string;
    positionId?: string;
    tokenAAmount?: string;
    tokenBAmount?: string;
    strategy?: string;
    depositMethod?: string;
    autoRebalance?: boolean;
    slippage?: number;
    convertToSol?: boolean;
    estimatedFeesUsd?: number;
    closureReason?: string;
  };
}