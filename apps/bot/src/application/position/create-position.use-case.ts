import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
  validatePoolAddress,
  validateWalletAddress,
} from "@/domain/position/position.validators";
import {
  DexType,
  CreatePositionParams,
  CreatePositionResult,
  Token,
  UnifiedPool,
} from "@/types/core.types";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import {
  JOB_TX_CONFIRM,
  JOB_SWAP_EXECUTION,
  SwapExecutionJobData,
} from "@/infrastructure/jobs/job-definitions";
import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";
import { WalletService } from "@/services/wallet.service";
import { uiToRawAmount } from "@/utils/number-utils";
import { SOL_MINT, OPEN_POSITION_FEE, BUFFER_AMOUNT } from "@/config/constants";
import { SolanaService } from "@/services/solana.service";
import { IPositionRepository } from "@/domain/position/position.repository";

// ============================================================================
// Constants & Configuration
// ============================================================================

const MIN_SOL_DEPOSIT = 0.1; // Minimum 0.1 SOL deposit
const MAX_ACTIVE_POSITIONS = 10; // Maximum 10 active positions per user
const FEE_BUFFER_SOL = BUFFER_AMOUNT; // 0.01 SOL buffer for transaction fees

// ============================================================================
// Zod Schemas for Input Validation
// ============================================================================

const TokenSchema = z.object({
  address: z.string().min(32),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  name: z.string().optional(),
  logoURI: z.string().optional(),
});

const PriceRangeSchema = z.object({
  min: z.number().positive(),
  max: z.number().positive(),
  rangeInterval: z.number().positive().default(10),
});

export const CreatePositionPreviewInputSchema = z.object({
  userId: z.string().uuid(),
  poolAddress: z.string().min(32),
  dex: z.enum(["meteora", "saros", "orca", "raydium"]),
  tokenA: TokenSchema,
  tokenB: TokenSchema,
  strategy: z.enum(["spot", "curve", "bid_ask"]).default("spot"),
  depositMethod: z.enum(["sol_auto_convert", "single_sided"]).default("sol_auto_convert"),
  solAmount: z.number().positive().optional(),
  priceRange: PriceRangeSchema.optional(),
  autoRebalance: z.boolean().default(false),
  rebalanceThreshold: z.number().min(1).max(100).optional(),
});

export const CreatePositionExecuteInputSchema = CreatePositionPreviewInputSchema.extend({
  walletId: z.string().min(1),
  walletAddress: z.string().min(32),
  tokenAAmount: z.string().min(1),
  tokenBAmount: z.string().min(1),
  depositSource: z.enum(["sol_convert", "token_balance"]).optional(),
  slippage: z.number().min(0).max(100).optional(),
  rebalanceSession: z.any().optional(), // RebalanceSessionMetadata
});

export type CreatePositionPreviewInput = z.infer<typeof CreatePositionPreviewInputSchema>;
export type CreatePositionExecuteInput = z.infer<typeof CreatePositionExecuteInputSchema>;

// ============================================================================
// Result Types
// ============================================================================

export interface CreatePositionPreviewResult {
  success: boolean;
  priceRange?: {
    min: number;
    max: number;
    current: number;
  };
  tokenAmounts?: {
    tokenAAmount: string;
    tokenBAmount: string;
    tokenAUsd: number;
    tokenBUsd: number;
  };
  fees?: {
    openPositionFee: number; // Percentage
    estimatedFeeLamports: number;
    estimatedFeeSOL: number;
    totalCostSOL: number;
  };
  slippageGuidance?: {
    recommended: number;
    minimum: number;
    maximum: number;
  };
  warnings?: string[];
  error?: string;
}

export interface CreatePositionExecuteResult {
  success: boolean;
  signature?: string;
  positionAddress?: string;
  pendingTransactionId?: string;
  error?: string;
}

// ============================================================================
// Helper Interfaces
// ============================================================================

export interface DexRegistryLike {
  get(dexType: DexType): IDexAdapter;
}

export interface PositionCreationContext {
  userId: string;
  walletAddress: string;
  walletId: string;
  dex: DexType;
  poolAddress: string;
  tokenA: Token;
  tokenB: Token;
  strategy: string;
  depositMethod: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;
  tokenAAmount: string;
  tokenBAmount: string;
  autoRebalance: boolean;
  rebalanceThreshold?: number;
  slPercentage?: number;
  tpPercentage?: number;
  expectedFeesLamports?: number;
  slippage?: number;
  positionAddress?: string;
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };
  rebalanceSession?: RebalanceSessionMetadata;
}

// ============================================================================
// Main Use Case Class
// ============================================================================

export class CreatePositionUseCase {
  private readonly cache: ICacheService;
  private readonly solanaService: SolanaService;

  constructor(
    private readonly dexRegistry: DexRegistryLike,
    private readonly positionRepository?: IPositionRepository,
    cacheService?: ICacheService,
    solanaService?: SolanaService
  ) {
    this.cache = cacheService ?? getCacheService();
    this.solanaService = solanaService ?? new SolanaService();
  }

  // ==========================================================================
  // Preview Method - Returns estimates without executing
  // ==========================================================================

  async preview(input: CreatePositionPreviewInput): Promise<CreatePositionPreviewResult> {
    try {
      // Validate input schema
      const validatedInput = CreatePositionPreviewInputSchema.parse(input);

      // Validate pool address format
      validatePoolAddress(validatedInput.poolAddress);

      // Check user position limits
      const positionLimitCheck = await this.checkPositionLimit(validatedInput.userId);
      if (!positionLimitCheck.allowed) {
        return {
          success: false,
          error: positionLimitCheck.reason,
        };
      }

      // Validate SOL amount if sol_auto_convert
      if (validatedInput.depositMethod === "sol_auto_convert") {
        if (!validatedInput.solAmount || validatedInput.solAmount < MIN_SOL_DEPOSIT) {
          return {
            success: false,
            error: `Minimum deposit is ${MIN_SOL_DEPOSIT} SOL. Please increase your amount.`,
          };
        }
      }

      // Get DEX adapter
      const adapter = this.dexRegistry.get(validatedInput.dex);

      // Fetch pool data
      const pool = await adapter.getPool(validatedInput.poolAddress);
      if (!pool) {
        return {
          success: false,
          error: "Pool not found or unavailable",
        };
      }

      // Calculate token distribution and price range
      const distribution = this.calculateTokenDistribution(
        validatedInput.solAmount || 0,
        pool,
        validatedInput.strategy,
        validatedInput.priceRange
      );

      // Calculate fees
      const fees = this.calculateFees(validatedInput.solAmount || 0);

      // Generate slippage guidance
      const slippageGuidance = this.generateSlippageGuidance(pool);

      // Generate warnings if any
      const warnings = this.generateWarnings(pool, validatedInput);

      return {
        success: true,
        priceRange: {
          min: distribution.priceRange.min,
          max: distribution.priceRange.max,
          current: pool.currentPrice,
        },
        tokenAmounts: {
          tokenAAmount: distribution.tokenAAmount,
          tokenBAmount: distribution.tokenBAmount,
          tokenAUsd: distribution.tokenAUsd,
          tokenBUsd: distribution.tokenBUsd,
        },
        fees,
        slippageGuidance,
        warnings,
      };
    } catch (error) {
      logger.error({ error, input }, "CreatePositionUseCase.preview failed");
      return {
        success: false,
        error: this.formatErrorMessage(error),
      };
    }
  }

  // ==========================================================================
  // Execute Method - Creates the position on-chain
  // ==========================================================================

  async execute(input: CreatePositionExecuteInput): Promise<CreatePositionExecuteResult> {
    try {
      // Validate input schema
      const validatedInput = CreatePositionExecuteInputSchema.parse(input);

      // Validate addresses
      validatePoolAddress(validatedInput.poolAddress);
      validateWalletAddress(validatedInput.walletAddress);

      if (!validatedInput.walletId || !validatedInput.walletAddress) {
        return {
          success: false,
          error: "Wallet ID and address are required",
        };
      }

      // Validate token amounts
      if (!validatedInput.tokenAAmount || parseFloat(validatedInput.tokenAAmount) <= 0) {
        return {
          success: false,
          error: "Token A amount must be greater than 0",
        };
      }
      if (!validatedInput.tokenBAmount || parseFloat(validatedInput.tokenBAmount) <= 0) {
        return {
          success: false,
          error: "Token B amount must be greater than 0",
        };
      }

      // Check position limits
      const positionLimitCheck = await this.checkPositionLimit(validatedInput.userId);
      if (!positionLimitCheck.allowed) {
        return {
          success: false,
          error: positionLimitCheck.reason,
        };
      }

      // Check minimum deposit for SOL auto-convert
      if (
        validatedInput.depositMethod === "sol_auto_convert" &&
        validatedInput.solAmount &&
        validatedInput.solAmount < MIN_SOL_DEPOSIT
      ) {
        return {
          success: false,
          error: `Minimum deposit is ${MIN_SOL_DEPOSIT} SOL. Current amount: ${validatedInput.solAmount} SOL`,
        };
      }

      // Check SOL balance if sol_auto_convert
      if (validatedInput.depositMethod === "sol_auto_convert" && validatedInput.solAmount) {
        const balanceCheck = await this.checkSolBalance(
          validatedInput.walletAddress,
          validatedInput.solAmount
        );
        if (!balanceCheck.sufficient) {
          return {
            success: false,
            error: balanceCheck.reason,
          };
        }
      }

      // Get DEX adapter
      const adapter = this.dexRegistry.get(validatedInput.dex);

      // Handle SOL auto-convert flow (swaps first)
      if (validatedInput.depositMethod === "sol_auto_convert" && validatedInput.solAmount) {
        return await this.handleSolAutoConvert(validatedInput);
      }

      // Direct position creation with existing tokens
      return await this.createPositionDirect(validatedInput, adapter);
    } catch (error) {
      logger.error({ error, input }, "CreatePositionUseCase.execute failed");
      return {
        success: false,
        error: this.formatErrorMessage(error),
      };
    }
  }

  // ==========================================================================
  // Private Helper Methods
  // ==========================================================================

  /**
   * Check if user has reached position limit
   */
  private async checkPositionLimit(
    userId: string
  ): Promise<{ allowed: boolean; reason?: string; count?: number }> {
    try {
      // Use repository if available, otherwise query database directly
      let activeCount = 0;

      if (this.positionRepository) {
        const activePositions = await this.positionRepository.findActiveByUser(userId);
        activeCount = activePositions.length;
      } else {
        // Fallback to direct database query
        const positions = await db.query.positions.findMany({
          where: (positions, { eq, and }) =>
            and(eq(positions.userId, userId), eq(positions.status, "ACTIVE")),
        });
        activeCount = positions.length;
      }

      if (activeCount >= MAX_ACTIVE_POSITIONS) {
        return {
          allowed: false,
          reason: `Maximum ${MAX_ACTIVE_POSITIONS} active positions allowed. Please close an existing position first.`,
          count: activeCount,
        };
      }

      return { allowed: true, count: activeCount };
    } catch (error) {
      logger.error({ error, userId }, "Failed to check position limit");
      // Allow creation if check fails (fail open)
      return { allowed: true };
    }
  }

  /**
   * Check if user has sufficient SOL balance
   */
  private async checkSolBalance(
    walletAddress: string,
    requiredAmount: number
  ): Promise<{ sufficient: boolean; reason?: string; balance?: number }> {
    try {
      const balance = await this.solanaService.getBalance(walletAddress);
      const requiredWithBuffer = requiredAmount + FEE_BUFFER_SOL;

      if (balance < requiredWithBuffer) {
        return {
          sufficient: false,
          reason: `Insufficient SOL balance. Required: ${requiredWithBuffer.toFixed(4)} SOL (${requiredAmount} + ${FEE_BUFFER_SOL} buffer), Available: ${balance.toFixed(4)} SOL`,
          balance,
        };
      }

      return { sufficient: true, balance };
    } catch (error) {
      logger.error({ error, walletAddress }, "Failed to check SOL balance");
      // Optimistically allow if balance check fails
      return { sufficient: true };
    }
  }

  /**
   * Check token balance for single-sided deposits
   */
  private async checkTokenBalance(
    walletAddress: string,
    tokenAddress: string,
    requiredAmount: number
  ): Promise<{ sufficient: boolean; reason?: string; balance?: number }> {
    try {
      const { balance } = await this.solanaService.getTokenBalance(walletAddress, tokenAddress);

      if (balance < requiredAmount) {
        return {
          sufficient: false,
          reason: `Insufficient token balance. Required: ${requiredAmount}, Available: ${balance}`,
          balance,
        };
      }

      return { sufficient: true, balance };
    } catch (error) {
      logger.error({ error, walletAddress, tokenAddress }, "Failed to check token balance");
      return { sufficient: true }; // Optimistically allow
    }
  }

  /**
   * Calculate token distribution for preview
   */
  private calculateTokenDistribution(
    solAmount: number,
    pool: UnifiedPool,
    strategy: string,
    priceRange?: { min: number; max: number; rangeInterval: number }
  ): {
    tokenAAmount: string;
    tokenBAmount: string;
    tokenAUsd: number;
    tokenBUsd: number;
    priceRange: { min: number; max: number };
  } {
    // Calculate fee and net amount
    const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
    const netAmount = solAmount - feeAmount;
    const halfAmount = netAmount / 2;

    // For SOL-based pools, estimate token amounts based on current price
    // This is a simplified calculation - actual amounts will be determined by the adapter
    const tokenAUsd = halfAmount;
    const tokenBUsd = halfAmount;

    // Estimate token amounts (this is approximate)
    const tokenAAmount = (halfAmount / (pool.currentPrice || 1)).toFixed(pool.tokenA.decimals);
    const tokenBAmount = halfAmount.toFixed(pool.tokenB.decimals);

    // Calculate price range based on strategy
    let calculatedPriceRange = priceRange || {
      min: pool.currentPrice * 0.9, // ±10% default
      max: pool.currentPrice * 1.1,
      rangeInterval: 10,
    };

    if (strategy === "spot") {
      // Balanced range around current price
      const interval = priceRange?.rangeInterval || 10;
      const rangePercent = interval / 100;
      calculatedPriceRange = {
        min: pool.currentPrice * (1 - rangePercent),
        max: pool.currentPrice * (1 + rangePercent),
      };
    }

    return {
      tokenAAmount,
      tokenBAmount,
      tokenAUsd,
      tokenBUsd,
      priceRange: calculatedPriceRange,
    };
  }

  /**
   * Calculate fees for position creation
   */
  private calculateFees(solAmount: number): {
    openPositionFee: number;
    estimatedFeeLamports: number;
    estimatedFeeSOL: number;
    totalCostSOL: number;
  } {
    const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
    const estimatedTxFeeLamports = 5000; // Approximate transaction fee in lamports
    const estimatedTxFeeSOL = estimatedTxFeeLamports / 1_000_000_000;
    const totalCost = solAmount + estimatedTxFeeSOL;

    return {
      openPositionFee: OPEN_POSITION_FEE,
      estimatedFeeLamports: estimatedTxFeeLamports,
      estimatedFeeSOL: estimatedTxFeeSOL,
      totalCostSOL: totalCost,
    };
  }

  /**
   * Generate slippage guidance based on pool
   */
  private generateSlippageGuidance(pool: UnifiedPool): {
    recommended: number;
    minimum: number;
    maximum: number;
  } {
    // Base slippage on pool liquidity and volatility
    let recommended = 0.5; // Default 0.5%

    // Higher slippage for low liquidity pools
    const liquidityValue = parseFloat(pool.liquidity);
    if (liquidityValue < 10000) {
      recommended = 2.0;
    } else if (liquidityValue < 100000) {
      recommended = 1.0;
    }

    return {
      recommended,
      minimum: 0.1,
      maximum: 5.0,
    };
  }

  /**
   * Generate warnings for the user
   */
  private generateWarnings(pool: UnifiedPool, input: CreatePositionPreviewInput): string[] {
    const warnings: string[] = [];

    // Unverified token warning
    if (!pool.isVerified) {
      warnings.push("⚠️ This pool contains unverified tokens. Exercise caution.");
    }

    // Low liquidity warning
    const liquidityValue = parseFloat(pool.liquidity);
    if (liquidityValue < 10000) {
      warnings.push(
        "⚠️ Low liquidity pool. You may experience higher slippage and price impact."
      );
    }

    // High deposit amount warning
    if (input.solAmount && input.solAmount > 100) {
      warnings.push(
        "⚠️ Large deposit amount. Consider splitting into multiple positions to reduce risk."
      );
    }

    return warnings;
  }

  /**
   * Create position directly with existing tokens
   */
  private async createPositionDirect(
    input: CreatePositionExecuteInput,
    adapter: IDexAdapter
  ): Promise<CreatePositionExecuteResult> {
    const adapterParams: CreatePositionParams = {
      poolAddress: input.poolAddress,
      userAddress: input.walletAddress,
      tokenAAmount: uiToRawAmount(input.tokenAAmount, input.tokenA.decimals).toString(),
      tokenBAmount: uiToRawAmount(input.tokenBAmount, input.tokenB.decimals).toString(),
      strategy: input.strategy,
      rangeInterval: input.priceRange?.rangeInterval,
    };

    let txResult: CreatePositionResult;
    try {
      txResult = await adapter.createPositionIxs(adapterParams);
    } catch (error) {
      logger.error({ error, input }, "Adapter.createPositionIxs failed");
      return {
        success: false,
        error: this.formatErrorMessage(error),
      };
    }

    if (!txResult?.success) {
      return {
        success: false,
        error: txResult?.error || "Failed to build position creation transaction",
      };
    }

    // Sign and send transaction
    let signature: string;
    try {
      signature = await WalletService.signAndSendViaGateway(
        input.walletId,
        input.walletAddress,
        txResult.instructions,
        [txResult.positionKp]
      );
    } catch (err) {
      logger.error({ err, input }, "Transaction submission failed");
      return {
        success: false,
        error: "Failed to submit transaction. Please try again.",
      };
    }

    if (!signature) {
      return {
        success: false,
        error: "Transaction signature missing after submission",
      };
    }

    const positionAddress = txResult.positionKp.publicKey.toBase58();

    // Create position context for tracking
    const positionContext: PositionCreationContext = {
      userId: input.userId,
      walletId: input.walletId,
      walletAddress: input.walletAddress,
      dex: input.dex,
      poolAddress: input.poolAddress,
      tokenA: input.tokenA,
      tokenB: input.tokenB,
      strategy: input.strategy ?? "spot",
      depositMethod: input.depositMethod ?? "sol_auto_convert",
      depositSource: input.depositSource,
      solAmount: input.solAmount,
      tokenAAmount: input.tokenAAmount,
      tokenBAmount: input.tokenBAmount,
      autoRebalance: input.autoRebalance ?? false,
      rebalanceThreshold: input.rebalanceThreshold,
      slippage: input.slippage,
      positionAddress,
      priceRange: input.priceRange,
      rebalanceSession: input.rebalanceSession,
    };

    // Record pending transaction
    try {
      await db.insert(pendingTransactions).values({
        signature,
        operationType: "CREATE_POSITION",
        userId: input.userId,
        status: "PENDING",
        metadata: {
          command: {
            userId: input.userId,
            dex: input.dex,
            poolAddress: input.poolAddress,
            strategy: input.strategy,
            tokenAAmount: input.tokenAAmount,
            tokenBAmount: input.tokenBAmount,
          },
          positionContext,
          rebalanceSession: input.rebalanceSession,
        },
        retryCount: 0,
        maxRetries: 3,
      });
    } catch (err) {
      logger.error({ err, signature }, "Failed to insert pending transaction");
      return {
        success: false,
        error: "Failed to persist transaction for tracking",
      };
    }

    // Enqueue confirmation job
    try {
      const jobQueue = new JobQueueService({ producerOnly: true });
      await jobQueue.enqueue(
        JOB_TX_CONFIRM,
        {
          signature,
          operationType: "CREATE_POSITION",
          userId: input.userId,
          positionAddress,
          submittedAt: Date.now(),
        },
        { delay: 500 }
      );
    } catch (err) {
      logger.warn({ err, signature }, "Failed to enqueue confirmation job");
    }

    // Invalidate cache
    try {
      await this.cache.invalidate(CachePatterns.portfolioPattern(input.userId));
    } catch (cacheError) {
      logger.debug({ userId: input.userId, cacheError }, "Failed to invalidate portfolio cache");
    }

    return {
      success: true,
      signature,
      positionAddress,
      pendingTransactionId: signature,
    };
  }

  /**
   * Handle SOL auto-convert flow (swaps first, then position creation)
   */
  private async handleSolAutoConvert(
    input: CreatePositionExecuteInput
  ): Promise<CreatePositionExecuteResult> {
    try {
      const positionCreationId = uuidv4();

      logger.info(
        {
          userId: input.userId,
          positionCreationId,
          solAmount: input.solAmount,
          tokenA: input.tokenA.address,
          tokenB: input.tokenB.address,
        },
        "[CreatePosition] Starting SOL auto-convert flow"
      );

      // Calculate SOL amounts for each swap (50/50 split after fees)
      const solAmount = input.solAmount || 0;
      const feeAmount = solAmount * (OPEN_POSITION_FEE / 100);
      const netAmount = solAmount - feeAmount;
      const halfAmount = netAmount / 2;

      // Store position creation context for later
      const swapContext = {
        command: {
          userId: input.userId,
          dex: input.dex,
          poolAddress: input.poolAddress,
          strategy: input.strategy,
          tokenAAmount: input.tokenAAmount,
          tokenBAmount: input.tokenBAmount,
        },
        positionContext: {
          userId: input.userId,
          walletAddress: input.walletAddress,
          walletId: input.walletId,
          dex: input.dex,
          poolAddress: input.poolAddress,
          tokenA: input.tokenA,
          tokenB: input.tokenB,
          strategy: input.strategy ?? "spot",
          depositMethod: "sol_auto_convert",
          solAmount: input.solAmount,
          tokenAAmount: input.tokenAAmount,
          tokenBAmount: input.tokenBAmount,
          autoRebalance: input.autoRebalance ?? false,
          slippage: input.slippage,
          priceRange: input.priceRange,
          rebalanceSession: input.rebalanceSession,
        } as PositionCreationContext,
        positionCreationId,
      };

      // Store the pending position creation context
      await db.insert(pendingTransactions).values({
        signature: positionCreationId,
        operationType: "CREATE_POSITION",
        userId: input.userId,
        status: "PENDING",
        metadata: swapContext,
        retryCount: 0,
        maxRetries: 3,
      });

      // Enqueue both swap jobs
      const jobQueue = new JobQueueService({ producerOnly: true });

      // First swap: SOL → TokenA
      await jobQueue.enqueue(JOB_SWAP_EXECUTION, {
        userId: input.userId,
        walletId: input.walletId,
        walletAddress: input.walletAddress,
        inputMint: SOL_MINT,
        outputMint: input.tokenA.address,
        inputAmount: halfAmount,
        outputDecimals: input.tokenA.decimals,
        expectedOutputAmount: input.tokenAAmount,
        positionCreationId,
        swapIndex: "first",
        dex: input.dex,
        poolAddress: input.poolAddress,
      } as SwapExecutionJobData);

      // Second swap: SOL → TokenB
      await jobQueue.enqueue(JOB_SWAP_EXECUTION, {
        userId: input.userId,
        walletId: input.walletId,
        walletAddress: input.walletAddress,
        inputMint: SOL_MINT,
        outputMint: input.tokenB.address,
        outputDecimals: input.tokenB.decimals,
        inputAmount: netAmount - halfAmount,
        expectedOutputAmount: input.tokenBAmount,
        positionCreationId,
        swapIndex: "second",
        dex: input.dex,
        poolAddress: input.poolAddress,
      } as SwapExecutionJobData);

      logger.info(
        {
          positionCreationId,
          firstSwap: `${halfAmount} SOL → ${input.tokenA.address}`,
          secondSwap: `${netAmount - halfAmount} SOL → ${input.tokenB.address}`,
        },
        "[CreatePosition] Swap jobs enqueued"
      );

      return {
        success: true,
        signature: positionCreationId,
        pendingTransactionId: positionCreationId,
      };
    } catch (error) {
      logger.error({ error, input }, "[CreatePosition] SOL auto-convert failed");
      return {
        success: false,
        error: this.formatErrorMessage(error),
      };
    }
  }

  /**
   * Format error messages to be user-friendly
   */
  private formatErrorMessage(error: unknown): string {
    if (error instanceof z.ZodError) {
      return `Validation error: ${error.errors.map((e) => e.message).join(", ")}`;
    }

    if (error instanceof Error) {
      const message = error.message;

      // Map common errors to user-friendly messages
      if (message.includes("insufficient funds") || message.includes("Insufficient")) {
        return "Insufficient balance to complete this transaction.";
      }

      if (message.includes("Pool not found")) {
        return "This pool is temporarily unavailable. Please try another pool.";
      }

      if (message.includes("Invalid address")) {
        return "Invalid wallet or token address provided.";
      }

      if (message.includes("Network")) {
        return "Network error. Please check your connection and try again.";
      }

      if (message.includes("slippage")) {
        return "Price moved too much. Try again or increase slippage tolerance.";
      }

      return message;
    }

    return "An unexpected error occurred. Please try again.";
  }
}
