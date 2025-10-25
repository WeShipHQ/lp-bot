import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import {
  TransactionConfirmJobData,
  JOB_POSITION_MONITOR,
  JOB_NOTIFICATION,
} from "../job-definitions";
import type { NotificationMessagePayload } from "../job-definitions";
import { logger } from "@/utils/logger";
import { SolanaAdapter } from "@/adapters/blockchain/solana.adapter";
import { db, pendingTransactions, users, User } from "@/db";
import { eq } from "drizzle-orm";
import { PositionRepository } from "@/infrastructure/database/repositories/position.repository";
import {
  TransactionParserService,
  ParsedTransactionData,
} from "@/services/transaction-parser.service";
import { 
  positionPersistenceService,
  rebalancePersistenceService,
  closePositionPersistenceService,
  claimFeesPersistenceService,
} from "@/services";
import { getTokenPriceService } from "@/services/token-price.service";
import { 
  MeteoraDlmmInstruction,
  parseMeteoraInstructions,
} from "@/utils/tx-parser";
import { 
  ClaimFeesContext,
  PositionClosureContext,
} from "@/application";
import Decimal from "decimal.js";
import { 
  lamportsToUi,
} from "@/utils/math";
import { 
  formatPercentage,
  formatPrice,
} from "@/presentation/formatters/base.formatter";
import { SOL_MINT } from "@/config/constants";
import { SwapService } from "@/services/swap.service";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";
import { container } from "@/infrastructure/di/container";

/**
 * Result of transaction parsing
 */
interface CloseInstructionExtractionResult {
  positionAddress?: string;
  finalTokenAAmount?: string;
  finalTokenBAmount?: string;
  finalTokenAAmountLamports?: string;
  finalTokenBAmountLamports?: string;
  claimedFeesTokenA?: string;
  claimedFeesTokenB?: string;
  claimedFeesTokenALamports?: string;
  claimedFeesTokenBLamports?: string;
  removeInstructionCount: number;
  claimInstructionCount: number;
  closeInstructionCount: number;
}

/**
 * Result of SOL conversion
 */
interface SolConversionResult {
  solAmount: Decimal;
  usdValue: number;
  success: boolean;
  error?: string;
}

/**
 * Complete rebalance session data
 */
interface CompleteRebalanceSession {
  sessionId: string;
  positionId: string;
  closeData: {
    signature: string;
    finalValueUsd: number;
    solProceeds: Decimal;
    feesClaimedUsd: number;
  };
  createData: {
    signature: string;
    totalValueUsd: number;
    solUsed: Decimal;
  };
  netSolChange: Decimal;
  totalValueUsd: number;
}

export class TransactionConfirmWorker
  implements IWorker<TransactionConfirmJobData>
{
  private readonly priceService = getTokenPriceService();
  private readonly meteoraAdapter = new MeteoraAdapter();
  private readonly cache = getCacheService();
  private readonly swapService = new SwapService();
  private readonly transactionParser = new TransactionParserService();

  constructor(
    private readonly solana: SolanaAdapter,
    private readonly positionRepository: PositionRepository
  ) {}

  async process(job: Job<TransactionConfirmJobData>): Promise<void> {
    console.log("TransactionConfirmWorker", job.data);
    const {
      signature,
      operationType,
      userId,
      positionId,
      positionAddress,
      submittedAt,
    } = job.data;
    const started = Date.now();

    try {
      const status = await this.solana.getSignatureStatus(signature);
      if (!status || (!status.confirmationStatus && !status.err)) {
        // Pending/no info: decide on retry vs timeout
        const [ptx] = await db
          .select()
          .from(pendingTransactions)
          .where(eq(pendingTransactions.signature, signature));
        const created =
          ptx?.createdAt ||
          (submittedAt ? new Date(submittedAt) : new Date(Date.now() - 1000));
        const ageMs = Date.now() - new Date(created).getTime();
        const timeoutMs = 5 * 60 * 1000; // 5 minutes
        if (ageMs > timeoutMs) {
          await db
            .update(pendingTransactions)
            .set({ status: "FAILED" })
            .where(eq(pendingTransactions.signature, signature));
        }
        throw new Error("Transaction pending");
      }

      // Mark as processing
      await db
        .update(pendingTransactions)
        .set({ status: "PROCESSING" })
        .where(eq(pendingTransactions.signature, signature));

      // Parse transaction and extract data
      const parsedData = await this.transactionParser.parseTransaction(signature);

      if (!parsedData.extractedData) {
        logger.error(
          "[TxConfirmWorker] Failed to extract transaction data",
          { signature }
        );
        return;
      }

      const extractedData = parsedData.extractedData;

      // Route to appropriate handler based on operation type
      switch (operationType) {
        case "CREATE_POSITION":
          await this.handleCreatePosition(jobData, extractedData);
          break;
        case "CLAIM_FEES":
          await this.handleClaimFees(jobData, extractedData);
          break;
        case "CLOSE_POSITION":
          await this.handleClosePosition(jobData, extractedData);
          break;
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }

      // Mark as completed
      await db
        .update(pendingTransactions)
        .set({
          status: "COMPLETED",
          completedAt: new Date(),
        })
        .where(eq(pendingTransactions.signature, signature));

      const duration = Date.now() - started;
      logger.info({
        signature,
        operationType,
        userId,
        duration,
      }, '[TransactionConfirmWorker] job completed');

    } catch (error) {
      logger.error({
        signature,
        operationType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }, '[TransactionConfirmWorker] job failed');

      // Mark as failed
      await db
        .update(pendingTransactions)
        .set({
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        })
        .where(eq(pendingTransactions.signature, signature));

      throw error;
    }
  }

  /**
   * Handle CREATE_POSITION confirmation
   */
  private async handleCreatePosition(
    jobData: TransactionConfirmJobData,
    extractedData: ParsedTransactionData
  ): Promise<void> {
    const { signature, userId } = jobData;
    const metadata = extractedData.metadata;

    if (!extractedData.positionAddress || !extractedData.tokenAAmount || !extractedData.tokenBAmount) {
      logger.error(
        "[TxConfirmWorker] Missing required data for position creation",
        { signature }
      );
      return;
    }

    // Create position in database
    const positionId = await positionPersistenceService.createPosition({
      signature,
      positionAddress: extractedData.positionAddress,
      context: metadata.positionContext!,
      onChainData: {
        actualTokenAAmount: extractedData.tokenAAmount,
        actualTokenBAmount: extractedData.tokenBAmount,
      },
      prices: extractedData.prices || {
        tokenAUsd: 0,
        tokenBUsd: 0,
        solUsd: 0,
      },
    });

    // Create initial segment
    await positionPersistenceService.createSegment({
      positionId,
      segmentNumber: 1,
      startTimestamp: new Date(),
      initialValueUSD: extractedData.calculatedValue || 0,
    });

    // Create creation snapshot
    await positionPersistenceService.createSnapshot({
      positionId,
      type: "creation",
      tokenBalances: {},
      usdValues: {
        currentValue: extractedData.calculatedValue || 0,
      },
      prices: extractedData.prices || {},
    });

    // Schedule position monitoring (if auto-rebalance enabled)
    if (metadata.positionContext?.autoRebalance) {
      const jobQueue = new JobQueueService({ producerOnly: true });

      await jobQueue.enqueue(
        JOB_POSITION_MONITOR,
        {
          userId,
          positionId,
        },
        {
          repeat: { every: 60 * 60 * 1000 }, // Every hour
        }
      );
    }

    logger.info(
      "[TxConfirmWorker] Position creation confirmed",
      {
        signature,
        positionId,
        positionAddress: extractedData.positionAddress,
      }
    );
  }

  /**
   * Handle CLAIM_FEES confirmation
   */
  private async handleClaimFees(
    jobData: TransactionConfirmJobData,
    extractedData: ParsedTransactionData
  ): Promise<void> {
    const { signature, userId } = jobData;
    const metadata = extractedData.metadata;

    if (!extractedData.positionId || !extractedData.tokenAAmount || !extractedData.tokenBAmount) {
      logger.error(
        "[TxConfirmWorker] Missing required data for claim fees",
        { signature }
      );
      return;
    }

    // Convert claimed fees to SOL
    const solConversion = await this.convertFeesToSOL(
      userId,
      extractedData.tokenAAmount,
      extractedData.tokenBAmount,
      metadata.tokenAMint,
      metadata.tokenBMint,
      metadata.tokenADecimals,
      metadata.tokenBDecimals
    );

    // Calculate USD values
    const priceData = await this.priceService.getPrices([
      metadata.tokenAMint,
      metadata.tokenBMint,
      SOL_MINT,
    ]);

    const estimatedUsd = this.calculateEstimatedUSD(
      extractedData.tokenAAmount,
      extractedData.tokenBAmount,
      priceData[metadata.tokenAMint]?.price || 0,
      priceData[metadata.tokenBMint]?.price || 0
    );

    const claimedUsd = solConversion.success && (priceData[SOL_MINT]?.price ?? 0) > 0
      ? solConversion.solAmount.mul(priceData[SOL_MINT]!.price)
      : estimatedUsd;

    // Record claim in database
    await claimFeesPersistenceService.recordClaim({
      signature,
      context: { positionId: extractedData.positionId!, userId },
      claimed: {
        tokenXAmount: extractedData.tokenAAmount,
        tokenYAmount: extractedData.tokenBAmount,
        claimedUsdValue: claimedUsd.toFixed(2),
        tokenXPriceUsd: priceData[metadata.tokenAMint]?.price ?? 0,
        tokenYPriceUsd: priceData[metadata.tokenBMint]?.price ?? 0,
        solReceived: solConversion.solAmount.isZero() 
          ? undefined 
          : solConversion.solAmount.toDecimalPlaces(9).toString(),
      },
      prices: { solUsd: priceData[SOL_MINT]?.price ?? 0 },
      claimType: "manual",
    });

    logger.info(
      "[TxConfirmWorker] Claim fees confirmed",
      {
        signature,
        positionId: extractedData.positionId,
        claimedUsd: claimedUsd,
      }
    );
  }

  /**
   * Handle CLOSE_POSITION confirmation
   */
  private async handleClosePosition(
    jobData: TransactionConfirmJobData,
    extractedData: ParsedTransactionData
  ): Promise<void> {
    const { signature, userId } = jobData;
    const metadata = extractedData.metadata;

    if (!extractedData.positionId || !extractedData.tokenAAmount || !extractedData.tokenBAmount) {
      logger.error(
        "[TxConfirmWorker] Missing required data for position close",
        { signature }
      );
      return;
    }

    // Convert all withdrawn tokens to SOL
    const solConversion = await this.convertWithdrawnTokensToSOL(
      userId,
      extractedData.tokenAAmount,
      extractedData.tokenBAmount,
      metadata.tokenAMint,
      metadata.tokenBMint,
      metadata.tokenADecimals,
      metadata.tokenBDecimals
    );

    // Calculate final USD values and PnL
    const priceData = await this.priceService.getPrices([
      metadata.tokenAMint,
      metadata.tokenBMint,
      SOL_MINT,
    ]);

    const finalValueUsd = solConversion.success && (priceData[SOL_MINT]?.price ?? 0) > 0
      ? solConversion.solAmount.mul(priceData[SOL_MINT]!.price)
      : 0;

    const initialValueUsd = await this.getPositionInitialValue(extractedData.positionId);
    const totalFeesClaimedUsd = await this.getPositionTotalFeesClaimed(extractedData.positionId);
    const totalPnlUsd = finalValueUsd - initialValueUsd + totalFeesClaimedUsd;
    const totalPnlPercentage = initialValueUsd > 0 
      ? (totalPnlUsd / initialValueUsd) * 100 
      : 0;

    // Record final position values
    await positionPersistenceService.updatePositionFinalValues({
      positionId: extractedData.positionId!,
      status: "CLOSED",
      closedAt: new Date(),
      closureSignature: signature,
      finalValueUSD: finalValueUsd,
      finalValueSOL: solConversion.solAmount.toDecimalPlaces(9).toString(),
      finalTokenXAmount: extractedData.tokenAAmount,
      finalTokenYAmount: extractedData.tokenBAmount,
      finalTokenXPriceUSD: priceData[metadata.tokenAMint]?.price ?? 0,
      finalTokenYPriceUSD: priceData[metadata.tokenBMint]?.price ?? 0,
      totalRealizedPnlUSD: totalPnlUsd,
    });

    // Close current segment
    await positionPersistenceService.closeSegment({
      positionId: extractedData.positionId!,
      segmentNumber: await this.getCurrentSegmentNumber(extractedData.positionId),
      endTimestamp: new Date(),
      finalValueUSD: finalValueUsd,
      realizedPnlUSD: totalPnlUsd,
      closureReason: metadata.closureReason || "user_close",
    });

    // Record final fee claim if any
    if (solConversion.claimedFeesUsd > 0) {
      await claimFeesPersistenceService.recordClaim({
        signature,
        context: { positionId: extractedData.positionId!, userId },
        claimed: {
          claimedUsdValue: solConversion.claimedFeesUsd.toFixed(2),
          solReceived: solConversion.claimedFeesSol.toDecimalPlaces(9).toString(),
        },
        prices: { solUsd: priceData[SOL_MINT]?.price ?? 0 },
        claimType: "closure",
      });
    }

    // Create closure snapshot
    await positionPersistenceService.createSnapshot({
      positionId: extractedData.positionId!,
      type: "closure",
      tokenBalances: {
        SOL: solConversion.solAmount.toDecimalPlaces(4).toString(),
      },
      usdValues: {
        currentValue: finalValueUsd,
        initialValue: initialValueUsd,
        pnlUsd: totalPnlUsd,
        totalFeesClaimed: totalFeesClaimedUsd,
      },
      prices: priceData,
    });

    logger.info(
      "[TxConfirmWorker] Position closed",
      {
        signature,
        positionId: extractedData.positionId,
        finalValueUsd,
        totalPnlUsd,
        totalPnlPercentage,
      }
    );
  }

  /**
   * Convert claimed fees to SOL
   */
  private async convertFeesToSOL(
    userId: string,
    tokenAAmount: string,
    tokenBAmount: string,
    tokenAMint: string,
    tokenBMint: string,
    tokenADecimals: number,
    tokenBDecimals: number
  ): Promise<SolConversionResult> {
    try {
      const priceData = await this.priceService.getPrices([
        tokenAMint,
        tokenBMint,
        SOL_MINT,
      ]);

      let solReceived = new Decimal(0);

      // Check for direct SOL fees
      if (tokenAMint === SOL_MINT) {
        solReceived = solReceived.add(lamportsToUi(tokenAAmount));
      }
      if (tokenBMint === SOL_MINT) {
        solReceived = solReceived.add(lamportsToUi(tokenBAmount));
      }

      // Swap non-SOL fees to SOL
      if (tokenAMint !== SOL_MINT && tokenAAmount !== "0") {
        const swapResult = await this.swapService.swapTokenToSol(
          userId,
          tokenAMint,
          BigInt(parseInt(tokenAAmount) * Math.pow(10, tokenADecimals))
        );
        if (swapResult.success) {
          solReceived = solReceived.add(swapResult.solAmount);
        } else {
          logger.warn(
            "[TxConfirmWorker] Failed to swap token A to SOL",
            { token: tokenAMint, amount: tokenAAmount, error: swapResult.error }
          );
        }
      }

      if (tokenBMint !== SOL_MINT && tokenBAmount !== "0") {
        const swapResult = await this.swapService.swapTokenToSol(
          userId,
          tokenBMint,
          BigInt(parseInt(tokenBAmount) * Math.pow(10, tokenBDecimals))
        );
        if (swapResult.success) {
          solReceived = solReceived.add(swapResult.solAmount);
        } else {
          logger.warn(
            "[TxConfirmWorker] Failed to swap token B to SOL",
            { token: tokenBMint, amount: tokenBAmount, error: swapResult.error }
          );
        }
      }

      const usdValue = solReceived.mul(priceData[SOL_MINT]?.price ?? 0);
      
      return {
        solAmount: solReceived,
        usdValue: usdValue.toNumber(),
        success: true,
      };
    } catch (error) {
      logger.error("[TxConfirmWorker] SOL conversion failed", { error });
      return {
        solAmount: new Decimal(0),
        usdValue: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert withdrawn tokens to SOL
   */
  private async convertWithdrawnTokensToSOL(
    userId: string,
    tokenAAmount: string,
    tokenBAmount: string,
    tokenAMint: string,
    tokenBMint: string,
    tokenADecimals: number,
    tokenBDecimals: number
  ): Promise<SolConversionResult> {
    try {
      const priceData = await this.priceService.getPrices([
        tokenAMint,
        tokenBMint,
        SOL_MINT,
      ]);

      let solReceived = new Decimal(0);

      // Swap token A to SOL
      if (tokenAMint !== SOL_MINT && tokenAAmount !== "0") {
        const swapResult = await this.swapService.swapTokenToSol(
          userId,
          tokenAMint,
          BigInt(parseInt(tokenAAmount) * Math.pow(10, tokenADecimals))
        );
        if (swapResult.success) {
          solReceived = solReceived.add(swapResult.solAmount);
        } else {
          logger.warn(
            "[TxConfirmWorker] Failed to swap token A to SOL",
            { token: tokenAMint, amount: tokenAAmount, error: swapResult.error }
          );
        }
      }

      // Swap token B to SOL
      if (tokenBMint !== SOL_MINT && tokenBAmount !== "0") {
        const swapResult = await this.swapService.swapTokenToSol(
          userId,
          tokenBMint,
          BigInt(parseInt(tokenBAmount) * Math.pow(10, tokenBDecimals))
        );
        if (swapResult.success) {
          solReceived = solReceived.add(swapResult.solAmount);
        } else {
          logger.warn(
            "[TxConfirmWorker] Failed to swap token B to SOL",
            { token: tokenBMint, amount: tokenBAmount, error: swapResult.error }
          );
        }
      }

      // Handle direct SOL amounts
      if (tokenAMint === SOL_MINT) {
        solReceived = solReceived.add(lamportsToUi(tokenAAmount));
      }
      if (tokenBMint === SOL_MINT) {
        solReceived = solReceived.add(lamportsToUi(tokenBAmount));
      }

      const usdValue = solReceived.mul(priceData[SOL_MINT]?.price ?? 0);
      
      return {
        solAmount: solReceived,
        usdValue: usdValue.toNumber(),
        success: true,
      };
    } catch (error) {
      logger.error("[TxConfirmWorker] SOL conversion failed", { error });
      return {
        solAmount: new Decimal(0),
        usdValue: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate estimated USD value from token amounts
   */
  private calculateEstimatedUSD(
    tokenAAmount: string,
    tokenBAmount: string,
    tokenAPrice: number,
    tokenBPrice: number
  ): number {
    try {
      const tokenAValue = new Decimal(tokenAAmount || "0").mul(tokenAPrice);
      const tokenBValue = new Decimal(tokenBAmount || "0").mul(tokenBPrice);
      return tokenAValue.plus(tokenBValue).toNumber();
    } catch (error) {
      logger.error("Failed to calculate estimated USD", { error });
      return 0;
    }
  }

  /**
   * Get position initial value from database
   */
  private async getPositionInitialValue(positionId: string): Promise<number> {
    const position = await this.positionRepository.findById(positionId);
    return Number(position?.initialValueUSD || "0");
  }

  /**
   * Get position total fees claimed from database
   */
  private async getPositionTotalFeesClaimed(positionId: string): Promise<number> {
    const position = await this.positionRepository.findById(positionId);
    return Number(position?.totalFeesClaimedUSD || "0");
  }

  /**
   * Get current segment number from database
   */
  private async getCurrentSegmentNumber(positionId: string): Promise<number> {
    const position = await this.positionRepository.findById(positionId);
    return Number(position?.currentSegmentNumber || 1);
  }
}