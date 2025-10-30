import { Connection, ParsedTransaction } from "@solana/web3.js";
import {
  parseMeteoraInstructions,
  MeteoraDlmmInstruction,
} from "@/utils/tx-parser";
import { logger } from "@/utils/logger";
import { rawToUiAmount } from "@/utils/number-utils";
import Decimal from "decimal.js";
import { Token } from "@/types/core.types";

export class TransactionParserService {
  constructor(private readonly connection: Connection) {}

  public async extractCreatePositionTransactionData(
    signature: string,
    tokenA: Token,
    tokenB: Token
  ) {
    const instructions = await this.parseMeteoraTransaction(signature);

    if (!instructions || instructions.length === 0) {
      logger.error(
        "[TxConfirmWorker] No Meteora instructions found in transaction",
        {
          signature,
        }
      );

      throw new Error("No Meteora instructions found in transaction");
    }

    const initializeInstruction = instructions.find(
      (ix) => ix.instructionType === "open"
    );

    const addLiquidityInstruction = instructions.find(
      (ix) => ix.instructionType === "add"
    );

    if (!initializeInstruction || !addLiquidityInstruction) {
      logger.error(
        "[TxConfirmWorker] Missing required instructions (open or add)",
        {
          signature,
          hasOpen: !!initializeInstruction,
          hasAdd: !!addLiquidityInstruction,
        }
      );

      throw new Error("Missing required instructions for position creation");
    }

    if (!initializeInstruction || !addLiquidityInstruction) {
      throw new Error("Missing required instructions for position creation");
    }

    const positionAddress = initializeInstruction.accounts.position;

    let tokenAmountX = new Decimal(0);
    let tokenAmountY = new Decimal(0);

    if (addLiquidityInstruction.tokenTransfers.length > 0) {
      const tokenAMint = tokenA.address;
      const tokenBMint = tokenB.address;

      const tokenATransfer = addLiquidityInstruction.tokenTransfers.find(
        (t) => t.mint === tokenAMint
      );
      const tokenBTransfer = addLiquidityInstruction.tokenTransfers.find(
        (t) => t.mint === tokenBMint
      );

      if (tokenATransfer) {
        tokenAmountX = rawToUiAmount(tokenATransfer.amount, tokenA.decimals);
      }
      if (tokenBTransfer) {
        tokenAmountY = rawToUiAmount(tokenBTransfer.amount, tokenB.decimals);
      }
    }

    return {
      positionAddress,
      tokenAmountX: tokenAmountX.toString(),
      tokenAmountY: tokenAmountY.toString(),
    };
  }

  public async extractClaimFeesTransactionData(
    signature: string,
    tokenA: Token,
    tokenB: Token
  ) {
    const instructions = await this.parseMeteoraTransaction(signature);

    if (!instructions || instructions.length === 0) {
      logger.error(
        "[TransactionParserService] No Meteora instructions found in transaction",
        {
          signature,
        }
      );

      throw new Error("No Meteora instructions found in transaction");
    }

    const claimTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };

    let positionAddr: string | undefined;

    for (const instruction of instructions) {
      if (!positionAddr && instruction.accounts?.position) {
        positionAddr = instruction.accounts.position;
      }

      if (
        instruction.instructionType === "claim" ||
        instruction.tokenTransfers?.length
      ) {
        for (const transfer of instruction.tokenTransfers) {
          if (transfer.mint === tokenA.address) {
            const amount = new Decimal(transfer.amount);
            claimTotals.tokenA = claimTotals.tokenA.add(amount);
          } else if (transfer.mint === tokenB.address) {
            const amount = new Decimal(transfer.amount);
            claimTotals.tokenB = claimTotals.tokenB.add(amount);
          }
        }
      }
    }

    return {
      positionAddress: positionAddr,
      claimedFeesTokenA: rawToUiAmount(
        claimTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      claimedFeesTokenB: rawToUiAmount(
        claimTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
    };
  }

  public async extractClosePositionTransactionData(
    signature: string,
    tokenA: Token,
    tokenB: Token
  ) {
    const instructions = await this.parseMeteoraTransaction(signature);

    if (!instructions || instructions.length === 0) {
      logger.error(
        "[TransactionParserService] No Meteora instructions found in transaction",
        {
          signature,
        }
      );

      throw new Error("No Meteora instructions found in transaction");
    }

    const removeTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };
    const removeTotalsLamports = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };
    const claimTotals = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };
    const claimTotalsLamports = {
      tokenA: new Decimal(0),
      tokenB: new Decimal(0),
    };

    let removeInstructionCount = 0;
    let claimInstructionCount = 0;
    let closeInstructionCount = 0;
    let positionAddr: string | undefined;

    for (const instruction of instructions) {
      if (!positionAddr && instruction.accounts?.position) {
        positionAddr = instruction.accounts.position;
      }

      if (instruction.instructionType === "remove") {
        removeInstructionCount += 1;
      } else if (instruction.instructionType === "claim") {
        claimInstructionCount += 1;
      } else if (instruction.instructionType === "close") {
        closeInstructionCount += 1;
      }

      if (
        instruction.instructionType !== "remove" &&
        instruction.instructionType !== "claim"
      ) {
        continue;
      }

      if (!instruction.tokenTransfers?.length) {
        continue;
      }

      for (const transfer of instruction.tokenTransfers) {
        if (transfer.mint === tokenA.address) {
          const amountLamports = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenA = removeTotals.tokenA.add(amountLamports);
            removeTotalsLamports.tokenA =
              removeTotalsLamports.tokenA.add(amountLamports);
          } else {
            claimTotals.tokenA = claimTotals.tokenA.add(amountLamports);
            claimTotalsLamports.tokenA =
              claimTotalsLamports.tokenA.add(amountLamports);
          }
        } else if (transfer.mint === tokenB.address) {
          const amountLamports = new Decimal(transfer.amount);
          if (instruction.instructionType === "remove") {
            removeTotals.tokenB = removeTotals.tokenB.add(amountLamports);
            removeTotalsLamports.tokenB =
              removeTotalsLamports.tokenB.add(amountLamports);
          } else {
            claimTotals.tokenB = claimTotals.tokenB.add(amountLamports);
            claimTotalsLamports.tokenB =
              claimTotalsLamports.tokenB.add(amountLamports);
          }
        }
      }
    }

    return {
      positionAddress: positionAddr,
      finalTokenAAmount: rawToUiAmount(
        removeTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      finalTokenBAmount: rawToUiAmount(
        removeTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
      // finalTokenAAmountLamports:
      //   removeInstructionCount > 0
      //     ? removeTotalsLamports.tokenA.toFixed(0)
      //     : undefined,
      // finalTokenBAmountLamports:
      //   removeInstructionCount > 0
      //     ? removeTotalsLamports.tokenB.toFixed(0)
      //     : undefined,
      claimedFeesTokenA: rawToUiAmount(
        claimTotals.tokenA.toString(),
        tokenA.decimals
      ).toString(),
      claimedFeesTokenB: rawToUiAmount(
        claimTotals.tokenB.toString(),
        tokenB.decimals
      ).toString(),
      // claimedFeesTokenALamports:
      //   claimInstructionCount > 0
      //     ? claimTotalsLamports.tokenA.toFixed(0)
      //     : undefined,
      // claimedFeesTokenBLamports:
      //   claimInstructionCount > 0
      //     ? claimTotalsLamports.tokenB.toFixed(0)
      //     : undefined,
      // removeInstructionCount,
      // claimInstructionCount,
      // closeInstructionCount,
    };
  }

  /**
   * Parses transaction and extracts operation-specific data
   */
  // async parseTransaction(signature: string): Promise<ParsedTransactionData> {
  //   try {
  //     const parsedTx = await this.connection.getParsedTransaction(signature, {
  //       maxSupportedTransactionVersion: 0,
  //     });

  //     if (!parsedTx) {
  //       throw new Error(`Unable to parse transaction ${signature}`);
  //     }

  //     const instructions = parseMeteoraInstructions(parsedTx);

  //     // Get metadata to determine operation type
  //     const metadata = parseTransactionMetadata(
  //       parsedTx.meta?.innerInstructions?.[0]?.data?.toString()
  //     );

  //     if (!metadata) {
  //       throw new Error(`No metadata found in transaction ${signature}`);
  //     }

  //     // Route to appropriate parser based on operation type
  //     if (isCreatePositionMetadata(metadata)) {
  //       return this.parseCreatePosition(
  //         signature,
  //         instructions,
  //         metadata as any
  //       );
  //     }

  //     if (isClaimFeesMetadata(metadata)) {
  //       return this.parseClaimFees(signature, instructions, metadata as any);
  //     }

  //     if (isClosePositionMetadata(metadata)) {
  //       return this.parseClosePosition(
  //         signature,
  //         instructions,
  //         metadata as any
  //       );
  //     }

  //     throw new Error(`Unknown operation type in transaction ${signature}`);
  //   } catch (error) {
  //     logger.error("Failed to parse transaction", { signature, error });
  //     throw error;
  //   }
  // }

  private async parseMeteoraTransaction(
    signature: string
  ): Promise<MeteoraDlmmInstruction[]> {
    try {
      const parsedTx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!parsedTx) {
        throw new Error(`Unable to parse transaction ${signature}`);
      }

      const instructions = parseMeteoraInstructions(parsedTx);

      return instructions;
    } catch (error) {
      logger.error("Failed to parse transaction", { signature, error });
      throw error;
    }
  }

  /**
   * Parses CREATE_POSITION transaction data
   */
  // private parseCreatePosition(
  //   signature: string,
  //   instructions: MeteoraDlmmInstruction[],
  //   metadata: any
  // ): ParsedTransactionData {
  //   const initializeInstruction = instructions.find(
  //     (ix) => ix.instructionType === "open"
  //   );
  //   const addLiquidityInstruction = instructions.find(
  //     (ix) => ix.instructionType === "add"
  //   );

  //   if (!initializeInstruction || !addLiquidityInstruction) {
  //     throw new Error("Missing required instructions for position creation");
  //   }

  //   // Extract position address
  //   const positionAddress =
  //     metadata.positionAddress || initializeInstruction.accounts.position;

  //   // Extract actual token amounts from transfers
  //   const tokenATransfer = addLiquidityInstruction.tokenTransfers?.find(
  //     (t) => t.mint === metadata.tokenAMint
  //   );
  //   const tokenBTransfer = addLiquidityInstruction.tokenTransfers?.find(
  //     (t) => t.mint === metadata.tokenBMint
  //   );

  //   const tokenAAmount = tokenATransfer
  //     ? rawToUiAmount(tokenATransfer.amount, metadata.tokenADecimals)
  //     : "0";
  //   const tokenBAmount = tokenBTransfer
  //     ? rawToUiAmount(tokenBTransfer.amount, metadata.tokenBDecimals)
  //     : "0";

  //   return {
  //     signature,
  //     operationType: "CREATE_POSITION",
  //     metadata,
  //     extractedData: {
  //       positionAddress,
  //       tokenAAmount,
  //       tokenBAmount,
  //       strategy: metadata.strategy,
  //       depositMethod: metadata.depositMethod,
  //       autoRebalance: metadata.autoRebalance,
  //       slippage: metadata.slippage,
  //     },
  //   };
  // }

  // /**
  //  * Parses CLAIM_FEES transaction data
  //  */
  // private parseClaimFees(
  //   signature: string,
  //   instructions: MeteoraDlmmInstruction[],
  //   metadata: any
  // ): ParsedTransactionData {
  //   const claimInstructions = instructions.filter(
  //     (ix) => ix.instructionType === "claim"
  //   );

  //   if (claimInstructions.length === 0) {
  //     throw new Error("No claim instructions found in transaction");
  //   }

  //   // Aggregate token transfers from all claim instructions
  //   const aggregateTransfers = new Map<string, number>();
  //   for (const instruction of claimInstructions) {
  //     for (const transfer of instruction.tokenTransfers ?? []) {
  //       const current = aggregateTransfers.get(transfer.mint) ?? 0;
  //       aggregateTransfers.set(transfer.mint, current + transfer.amount);
  //     }
  //   }

  //   const tokenAAmount = aggregateTransfers.get(metadata.tokenAMint)
  //     ? rawToUiAmount(
  //         aggregateTransfers.get(metadata.tokenAMint)!,
  //         metadata.tokenADecimals
  //       )
  //     : "0";
  //   const tokenBAmount = aggregateTransfers.get(metadata.tokenBMint)
  //     ? rawToUiAmount(
  //         aggregateTransfers.get(metadata.tokenBMint)!,
  //         metadata.tokenBDecimals
  //       )
  //     : "0";

  //   return {
  //     signature,
  //     operationType: "CLAIM_FEES",
  //     metadata,
  //     extractedData: {
  //       positionId: metadata.positionId,
  //       tokenAAmount,
  //       tokenBAmount,
  //       convertToSol: metadata.convertToSol,
  //       estimatedFeesUsd: metadata.estimatedFeesUsd,
  //     },
  //   };
  // }

  // /**
  //  * Parses CLOSE_POSITION transaction data
  //  */
  // private parseClosePosition(
  //   signature: string,
  //   instructions: MeteoraDlmmInstruction[],
  //   metadata: any
  // ): ParsedTransactionData {
  //   const closeInstruction = instructions.find(
  //     (ix) => ix.instructionType === "close"
  //   );
  //   const removeInstructions = instructions.filter(
  //     (ix) => ix.instructionType === "remove"
  //   );

  //   if (!closeInstruction) {
  //     throw new Error("Missing close instruction in transaction");
  //   }

  //   // Extract position address
  //   const positionAddress =
  //     metadata.positionAddress || closeInstruction.accounts.position;

  //   // Aggregate token transfers from remove instructions
  //   const aggregateTransfers = new Map<string, number>();
  //   for (const instruction of removeInstructions) {
  //     for (const transfer of instruction.tokenTransfers ?? []) {
  //       const current = aggregateTransfers.get(transfer.mint) ?? 0;
  //       aggregateTransfers.set(transfer.mint, current + transfer.amount);
  //     }
  //   }

  //   const tokenAAmount = aggregateTransfers.get(metadata.tokenAMint)
  //     ? rawToUiAmount(
  //         aggregateTransfers.get(metadata.tokenAMint)!,
  //         metadata.tokenADecimals
  //       )
  //     : "0";
  //   const tokenBAmount = aggregateTransfers.get(metadata.tokenBMint)
  //     ? rawToUiAmount(
  //         aggregateTransfers.get(metadata.tokenBMint)!,
  //         metadata.tokenBDecimals
  //       )
  //     : "0";

  //   return {
  //     signature,
  //     operationType: "CLOSE_POSITION",
  //     metadata,
  //     extractedData: {
  //       positionId: metadata.positionId,
  //       tokenAAmount,
  //       tokenBAmount,
  //       closureReason: metadata.closureReason,
  //     },
  //   };
  // }
}

/**
 * Result of transaction parsing
 */
// export interface ParsedTransactionData {
//   signature: string;
//   operationType: string;
//   metadata: TransactionMetadata;
//   extractedData: {
//     positionAddress?: string;
//     positionId?: string;
//     tokenAAmount?: string;
//     tokenBAmount?: string;
//     strategy?: string;
//     depositMethod?: string;
//     autoRebalance?: boolean;
//     slippage?: number;
//     convertToSol?: boolean;
//     estimatedFeesUsd?: number;
//     closureReason?: string;
//   };
// }
