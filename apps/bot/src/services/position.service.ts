import { meteoraDlmmService } from "./meteora/dlmm.service";
import { JupiterService, jupiterService } from "./jupiter.service";
import BN from "bn.js";
import { WalletService } from "./wallet.service";
import {
  db,
  Position,
  positions,
  positionSnapshots,
  User,
  rebalanceEvents,
  PositionSegment,
  claimHistory,
  positionSegments,
} from "@/db";
import { SOL_MINT } from "@/config/constants";
import { meteoraPositionService } from "./meteora/position.service";
import { MeteoraCreatePositionStrategy } from "@/types/meteora.types";
import { OPEN_POSITION_FEE } from "@/bot/config/constants";
import { LbPosition, StrategyType } from "@meteora-ag/dlmm";
import { poolService } from "./pool.service";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { JobQueueService } from "./job-queue.service";
import {
  createClaimHistory,
  createPosition,
  createPositionSegment,
  createRebalanceEvent,
  getCurrentSegment,
  getPositionsByAddress,
  getPositionsById,
  getTotalClaimedFees,
  updatePosition,
  updatePositionSegment,
} from "@/db/queries";
import { logger } from "@/utils/logger";
import { CONFIG } from "@/config";
import { parseMeteoraInstructions } from "@/utils/tx-parser";
import { TokenAdapter } from "@/adapters/token.adapter";
import { TokenPriceService } from "./token-price.service";
import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { PositionPnlResult } from "@/types/position.types";
import { TokenPrice } from "@/types/token.types";

export interface PositionCreationResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  positionId?: string;
}

export interface PositionCloseResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface FeeClaimResult {
  success: boolean;
  transactionId?: string;
  claimedFeeXAmount?: string;
  claimedFeeXValueUSD?: string;
  claimedFeeYAmount?: string;
  claimedFeeYValueUSD?: string;
  totalClaimedFeeUSD?: string;
  totalClaimedFees?: string;
  cumulativePnL?: string;
  error?: string;
}

export interface ClaimFeeResult {
  success: boolean;
  transactionId?: string;
  claimedFeeXAmount?: string;
  claimedFeeXValueUSD?: string;
  claimedFeeYAmount?: string;
  claimedFeeYValueUSD?: string;
  totalClaimedFeeUSD?: string;
  totalClaimedFees?: string;
  cumulativePnL?: string;
  error?: string;
}

export interface RebalanceResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  rebalanceEventId?: string;
}

export class PositionService {
  private jupiterService: JupiterService;
  private jobQueueService: JobQueueService;
  private tokenPriceService: TokenPriceService;
  private tokenAdapter: TokenAdapter;

  constructor() {
    this.jobQueueService = new JobQueueService();
    this.jupiterService = new JupiterService();
    this.tokenPriceService = new TokenPriceService();
    this.tokenAdapter = new TokenAdapter();
  }

  /// --------------------------------------

  /**
   * Create a balanced liquidity position
   */
  async createBalancedPositionV1(
    user: User,
    poolAddress: string,
    selectedStrategy: MeteoraCreatePositionStrategy,
    enteredAmount: number,
    autoRebalancing: boolean
  ): Promise<PositionCreationResult> {
    try {
      logger.info(
        `[Position] Creating ${selectedStrategy} position for user ${user.id}`
      );

      // Calculate fee and net amount
      const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
      const amount = enteredAmount - feeAmount;

      // Get pool information
      const poolInfo = await poolService.getPoolV2(poolAddress);
      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      const { strategy } = this.getMeteoraStrategy(selectedStrategy);
      const halfAmount = amount / 2;
      const halfAmountLamports = (halfAmount * 1e9).toString();

      logger.debug(`[Position] Starting SOL to Token A & B conversions...`);

      // Swap SOL to tokens in parallel
      const [tokenAAmount, tokenBAmount] = await Promise.all([
        this.swapSolToToken(user, poolInfo.tokenA.address, halfAmountLamports),
        this.swapSolToToken(user, poolInfo.tokenB.address, halfAmountLamports),
      ]);

      if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
        throw new Error("Failed to convert SOL to tokens");
      }

      // Create position on blockchain
      const positionKp = Keypair.generate();
      const { instructions } = await meteoraDlmmService.createPositionIx(
        positionKp.publicKey,
        new PublicKey(poolAddress),
        new PublicKey(user.walletAddress!),
        tokenAAmount,
        tokenBAmount,
        strategy,
        user.balancedPositionBinRange
      );

      const signature = await WalletService.signAndSendTransaction(
        user,
        instructions,
        [positionKp]
      );

      // Queue background processing for database operations
      await this.handlePositionCreatedV1(
        user,
        amount,
        autoRebalancing,
        signature,
        positionKp.publicKey.toString()
      );

      return {
        success: true,
        transactionId: signature,
        positionId: positionKp.publicKey.toString(),
      };
    } catch (error) {
      logger.error(`[Position] Error creating position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create position",
      };
    }
  }

  /**
   * Handle position creation with enhanced database operations
   */
  private async handlePositionCreatedV1(
    user: User,
    amount: number,
    autoRebalancing: boolean,
    signature: string,
    positionAddress: string
  ) {
    try {
      const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

      const parsedTransaction = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
        }
      );

      if (!parsedTransaction) {
        throw new Error(`Transaction not found or not confirmed: ${signature}`);
      }

      const meteoraParsedIxs =
        await parseMeteoraInstructions(parsedTransaction);
      if (meteoraParsedIxs.length === 0) {
        throw new Error("No meteora instruction found");
      }

      const openIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "open" &&
          ix.instructionName === "initialize_position"
      );

      const addIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "add" &&
          ix.instructionName === "add_liquidity_by_strategy2"
      );

      if (!openIx || !addIx) {
        throw new Error("No meteora instruction found");
      }

      const poolAddress = openIx.accounts.lbPair;
      const mintX = addIx.accounts.tokenXMint;
      const mintY = addIx.accounts.tokenYMint;

      if (!mintX || !mintY) {
        throw new Error("No token mint found");
      }

      // Get token information
      const { tokenX: jupiterTokenX, tokenY: jupiterTokenY } =
        await this.jupiterService.getTokenPairInfo(mintX, mintY);

      const tokenX = this.tokenAdapter.transformToken(jupiterTokenX);
      const tokenY = this.tokenAdapter.transformToken(jupiterTokenY);

      // Get current token prices
      const prices = await this.tokenPriceService.getPrices([
        tokenX.address,
        tokenY.address,
      ]);

      if (!prices || !prices[tokenX.address] || !prices[tokenY.address]) {
        throw new Error("No token price found");
      }

      // Extract deposited amounts from transaction
      const amountX =
        addIx.tokenTransfers.find(
          (transfer) => transfer.mint === addIx.accounts.tokenXMint
        )?.amount ?? 0;

      const amountY =
        addIx.tokenTransfers.find(
          (transfer) => transfer.mint === addIx.accounts.tokenYMint
        )?.amount ?? 0;

      if (amountX === 0 || amountY === 0) {
        throw new Error("No token amount found");
      }

      const priceXUSD = new Decimal(prices[tokenX.address].price);
      const priceYUSD = new Decimal(prices[tokenY.address].price);

      // Calculate USD values
      const tokenXValueUSD = new Decimal(amountX)
        .div(new Decimal(10).pow(tokenX.decimals))
        .mul(priceXUSD);

      const tokenYValueUSD = new Decimal(amountY)
        .div(new Decimal(10).pow(tokenY.decimals))
        .mul(priceYUSD);

      const initialValueUSD = tokenXValueUSD.add(tokenYValueUSD);
      const initialValueSOL = new Decimal(amount).toString();

      // Create position record with enhanced schema
      const newPosition = await createPosition({
        userId: user.id,
        positionAddress,
        poolAddress,
        dex: "meteora",
        strategyType: "DLMM",
        tokenX,
        tokenY,
        status: "ACTIVE",

        // Initial investment tracking
        initialValueUSD: initialValueUSD.toString(),
        initialValueSOL: initialValueSOL,
        initialTokenXAmount: amountX.toString(),
        initialTokenYAmount: amountY.toString(),
        initialTokenXPriceUSD: priceXUSD.toString(),
        initialTokenYPriceUSD: priceYUSD.toString(),

        // Current segment tracking (first segment)
        currentSegmentNumber: 1,
        currentSegmentInitialUSD: initialValueUSD.toString(),
        currentSegmentStartAt: new Date(),

        // Cumulative PnL tracking (starts at 0)
        totalRealizedPnlUSD: "0",
        totalFeesClaimedUSD: "0",

        // Risk management
        isRebalancingEnabled: autoRebalancing,
        rebalanceThreshold: "20.0",

        // Transaction references
        creationSignature: signature,
      });

      if (!newPosition) {
        throw new Error("Failed to create position record");
      }

      // Create initial position segment
      const initialSegment = await createPositionSegment({
        positionId: newPosition.id,
        segmentNumber: 1,
        startTimestamp: new Date(),
        initialValueUSD: initialValueUSD.toString(),
        startPositionAddress: positionAddress,
      });

      // Create initial position snapshot
      await this.createPositionSnapshot({
        positionId: newPosition.id,
        segmentId: initialSegment.id,
        snapshotType: "creation",
        currentValueUSD: initialValueUSD.toString(),
        tokenXAmount: amountX.toString(),
        tokenYAmount: amountY.toString(),
        unclaimedFeesX: "0",
        unclaimedFeesY: "0",
        unclaimedFeesUSD: "0",
        unrealizedPnlUSD: "0",
        unrealizedPnlPercentage: "0",
        totalPnlUSD: "0",
        totalPnlPercentage: "0",
        tokenXPriceUSD: priceXUSD.toString(),
        tokenYPriceUSD: priceYUSD.toString(),
        solPriceUSD: prices[SOL_MINT]?.price?.toString() || "0",
      });

      logger.info(
        `[Position] Position created successfully: ${newPosition.id}, Initial value: $${initialValueUSD.toString()}`
      );
    } catch (error) {
      logger.error(
        `[Position] Error handling position created: ${error}`,
        error
      );
      // Consider implementing retry logic or error notification here
    }
  }

  /**
   * Claim fees from an active position
   */
  async claimFeeV1(user: User, positionId: string): Promise<ClaimFeeResult> {
    try {
      logger.info(
        `[Position] Claiming fee for position ${positionId} for user ${user.id}`
      );

      const position = await getPositionsById(positionId);
      if (!position) {
        throw new Error("Position not found");
      }

      if (position.status !== "ACTIVE") {
        throw new Error("Position is not active");
      }

      // Get current segment
      const currentSegment = await getCurrentSegment(position.id);
      if (!currentSegment) {
        throw new Error("No current segment found for position");
      }

      const { instructions } = await meteoraDlmmService.claimFeesIx(
        new PublicKey(user.walletAddress),
        new PublicKey(position.poolAddress),
        new PublicKey(position.positionAddress)
      );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions,
        []
      );

      // Process fee claim asynchronously
      const result = await this.handleFeeClaimedV1(
        user,
        position,
        currentSegment,
        transactionId
      );

      return {
        success: true,
        transactionId,
        ...result,
      };
    } catch (error) {
      logger.error(`[Position] Error claiming fee:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to claim fee",
      };
    }
  }

  /**
   * Handle fee claimed with enhanced database operations
   */
  private async handleFeeClaimedV1(
    user: User,
    position: Position,
    currentSegment: PositionSegment,
    signature: string
  ) {
    try {
      const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

      const parsedTransaction = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
        }
      );

      if (!parsedTransaction) {
        throw new Error(`Transaction not found or not confirmed: ${signature}`);
      }

      const meteoraParsedIxs =
        await parseMeteoraInstructions(parsedTransaction);
      if (meteoraParsedIxs.length === 0) {
        throw new Error("No meteora instruction found");
      }

      const claimIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
      );

      if (!claimIx) {
        throw new Error("No meteora claim instruction found");
      }

      const tokenMintX = position.tokenX?.address!;
      const tokenMintY = position.tokenY?.address!;

      const prices = await this.tokenPriceService.getPrices([
        tokenMintX,
        tokenMintY,
        SOL_MINT,
      ]);

      if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
        throw new Error("Failed to fetch token prices");
      }

      const priceXUSD = new Decimal(prices[tokenMintX].price);
      const priceYUSD = new Decimal(prices[tokenMintY].price);
      const solPriceUSD = new Decimal(prices[SOL_MINT]?.price || "0");

      // Extract claimed amounts from transaction
      const claimedTokenXAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );
      const claimedTokenYAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      // Calculate USD values
      const claimedTokenXValueUSD = claimedTokenXAmount
        .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
        .mul(priceXUSD);

      const claimedTokenYValueUSD = claimedTokenYAmount
        .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
        .mul(priceYUSD);

      const totalClaimedUSD = claimedTokenXValueUSD.add(claimedTokenYValueUSD);

      // Swap claimed tokens to SOL
      let totalSolReceived = new Decimal(0);

      const [solFromTokenX, solFromTokenY] = await Promise.all([
        // Swap Token X to SOL if not already SOL
        (async () => {
          if (tokenMintX !== SOL_MINT && claimedTokenXAmount.gt(0)) {
            try {
              const swapResult = await this.swapTokenToSol(
                user,
                tokenMintX,
                claimedTokenXAmount.toString()
              );

              return swapResult;
            } catch (error) {
              logger.warn(`[Position] Failed to swap token X to SOL: ${error}`);
              return new Decimal(0);
            }
          } else if (tokenMintX === SOL_MINT) {
            return claimedTokenXAmount.div(1e9); // Convert lamports to SOL
          }
          return new Decimal(0);
        })(),

        // Swap Token Y to SOL if not already SOL
        (async () => {
          if (tokenMintY !== SOL_MINT && claimedTokenYAmount.gt(0)) {
            try {
              const swapResult = await this.swapTokenToSol(
                user,
                tokenMintY,
                claimedTokenYAmount.toString()
              );
              return swapResult;
            } catch (error) {
              logger.warn(`[Position] Failed to swap token Y to SOL: ${error}`);
              return new Decimal(0);
            }
          } else if (tokenMintY === SOL_MINT) {
            return claimedTokenYAmount.div(1e9); // Convert lamports to SOL
          }
          return new Decimal(0);
        })(),
      ]);

      totalSolReceived = solFromTokenX.add(solFromTokenY);

      // Database operations in transaction
      await db.transaction(async (tx) => {
        // 1. Create claim history record
        await tx.insert(claimHistory).values({
          positionId: position.id,
          segmentId: currentSegment.id,
          timestamp: new Date(),
          claimType: "manual",
          claimedTokenXAmount: claimedTokenXAmount.toString(),
          claimedTokenYAmount: claimedTokenYAmount.toString(),
          claimedUSDValue: totalClaimedUSD.toString(),
          tokenXPriceUSD: priceXUSD.toString(),
          tokenYPriceUSD: priceYUSD.toString(),
          solReceived: totalSolReceived.toString(),
          solPriceUSD: solPriceUSD.toString(),
          transactionSignature: signature,
          isDuringRebalance: false,
          notes: "Manual fee claim",
        });

        // 2. Update position totals
        const newTotalFeesClaimedUSD = new Decimal(
          position.totalFeesClaimedUSD || "0"
        ).add(totalClaimedUSD);

        const newTotalRealizedPnlUSD = new Decimal(
          position.totalRealizedPnlUSD || "0"
        ).add(totalClaimedUSD);

        await tx
          .update(positions)
          .set({
            totalFeesClaimedUSD: newTotalFeesClaimedUSD.toString(),
            totalRealizedPnlUSD: newTotalRealizedPnlUSD.toString(),
            updatedAt: new Date(),
          })
          .where(eq(positions.id, position.id));

        // 3. Update current segment
        const newSegmentFeesClaimedUSD = new Decimal(
          currentSegment.feesClaimedUSD || "0"
        ).add(totalClaimedUSD);

        await tx
          .update(positionSegments)
          .set({
            feesClaimedUSD: newSegmentFeesClaimedUSD.toString(),
          })
          .where(eq(positionSegments.id, currentSegment.id));

        // 4. Create position snapshot after claim
        await this.createPositionSnapshotV1(tx, {
          positionId: position.id,
          segmentId: currentSegment.id,
          snapshotType: "claim",
          currentValueUSD: position.currentSegmentInitialUSD, // Current liquidity value (would need to fetch from chain)
          tokenXAmount: "0", // Would need current position data
          tokenYAmount: "0", // Would need current position data
          unclaimedFeesX: "0", // Fees just claimed
          unclaimedFeesY: "0", // Fees just claimed
          unclaimedFeesUSD: "0",
          unrealizedPnlUSD: "0", // Would calculate based on current position value
          unrealizedPnlPercentage: "0",
          totalPnlUSD: newTotalRealizedPnlUSD.toString(),
          totalPnlPercentage: newTotalRealizedPnlUSD
            .div(new Decimal(position.initialValueUSD))
            .mul(100)
            .toString(),
          tokenXPriceUSD: priceXUSD.toString(),
          tokenYPriceUSD: priceYUSD.toString(),
          solPriceUSD: solPriceUSD.toString(),
        });
      });

      logger.info(
        `[Position] Fee claimed successfully for position ${position.id}: ${totalClaimedUSD.toString()} USD`
      );

      // Calculate total claimed fees for response
      const totalClaimedFees = await getTotalClaimedFees(position.id);

      return {
        claimedFeeXAmount: claimedTokenXAmount.toString(),
        claimedFeeXValueUSD: claimedTokenXValueUSD.toString(),
        claimedFeeYAmount: claimedTokenYAmount.toString(),
        claimedFeeYValueUSD: claimedTokenYValueUSD.toString(),
        totalClaimedFeeUSD: totalClaimedUSD.toString(),
        totalClaimedFees,
        cumulativePnL: new Decimal(position.totalRealizedPnlUSD || "0")
          .add(totalClaimedUSD)
          .toString(),
      };
    } catch (error) {
      logger.error(`[Position] Error handling fee claimed: ${error}`, error);
      throw error;
    }
  }

  /**
   * Rebalance a position (close current, create new)
   */
  async rebalanceV1(
    user: User,
    positionAddress: string
  ): Promise<RebalanceResult> {
    try {
      logger.info(
        `[Position] Starting rebalance for position ${positionAddress}`
      );

      // Get position and validate
      const dbPosition = await getPositionsByAddress(positionAddress);
      if (!dbPosition) {
        throw new Error("Position not found");
      }

      if (dbPosition.status !== "ACTIVE") {
        throw new Error("Position is not active");
      }

      // Update position status to REBALANCING
      await updatePosition(dbPosition.id, {
        status: "REBALANCING",
        updatedAt: new Date(),
      });

      try {
        const currentSegment = await getCurrentSegment(dbPosition.id);
        if (!currentSegment) {
          throw new Error("No current segment found");
        }

        const poolInfo = await poolService.getPoolV2(dbPosition.poolAddress);
        if (!poolInfo) {
          throw new Error("Pool not found");
        }

        const { lbPosition } = await meteoraDlmmService.getPosition(
          dbPosition.poolAddress,
          positionAddress
        );

        if (!lbPosition) {
          throw new Error("Failed to fetch position data from Meteora");
        }

        const prices = await this.tokenPriceService.getPrices([
          poolInfo.tokenA.address,
          poolInfo.tokenB.address,
        ]);

        const priceX = prices[poolInfo.tokenA.address];
        const priceY = prices[poolInfo.tokenB.address];

        if (!priceX || !priceY) {
          throw new Error("Failed to fetch token prices");
        }

        // Calculate current segment PnL
        const pnlResult = this.calculatePositionPnl(
          dbPosition,
          lbPosition,
          priceX,
          priceY
        );
        const segmentFinalUSD = new Decimal(pnlResult.currentValueUSD);
        const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);
        const segmentPnlUSD = segmentFinalUSD.minus(segmentInitialUSD);
        const segmentPnlPct = segmentInitialUSD.gt(0)
          ? segmentPnlUSD.div(segmentInitialUSD).mul(100)
          : new Decimal(0);

        logger.debug(
          `[Position] Segment PnL: ${segmentPnlUSD.toString()} USD (${segmentPnlPct.toString()}%)`
        );

        // Step 1: Close current position and get tokens
        const { totalSolReceived } = await this.closeAndConvertToSol(
          user,
          dbPosition,
          poolInfo
        );

        // Step 2: Close current segment
        await updatePositionSegment(currentSegment.id, {
          endTimestamp: new Date(),
          finalValueUSD: segmentFinalUSD.toString(),
          realizedPnlUSD: segmentPnlUSD.toString(),
          realizedPnlPercentage: segmentPnlPct.toString(),
          closureReason: "rebalance",
          endPositionAddress: positionAddress,
        });

        // Step 3: Create new balanced position
        const newPositionAmount = totalSolReceived.toNumber();
        const strategyType =
          dbPosition.strategyType as MeteoraCreatePositionStrategy;

        const createResult = await this.createBalancedPositionV1(
          user,
          dbPosition.poolAddress,
          strategyType,
          newPositionAmount,
          dbPosition.isRebalancingEnabled || false
        );

        if (!createResult.success || !createResult.transactionId) {
          throw new Error(
            `Failed to create new position: ${createResult.error}`
          );
        }

        // Step 4: Create new segment
        const newSegmentInitialUSD = totalSolReceived.mul(priceX?.price || 1);
        const newSegment = await createPositionSegment({
          positionId: dbPosition.id,
          segmentNumber: dbPosition.currentSegmentNumber + 1,
          startTimestamp: new Date(),
          initialValueUSD: newSegmentInitialUSD.toString(),
          startPositionAddress: createResult.positionId || "pending",
        });

        // Step 5: Create rebalance event
        const rebalanceEvent = await createRebalanceEvent({
          positionId: dbPosition.id,
          timestamp: new Date(),
          triggerReason: "Manual rebalance",
          oldPositionAddress: positionAddress,
          newPositionAddress: createResult.positionId || "pending",
          closedSegmentId: currentSegment.id,
          segmentInitialUSD: segmentInitialUSD.toString(),
          segmentFinalUSD: segmentFinalUSD.toString(),
          segmentPnlUSD: segmentPnlUSD.toString(),
          segmentPnlPercentage: segmentPnlPct.toString(),
          feesCollectedUSD: "0",
          newSegmentId: newSegment.id,
          newSegmentInitialUSD: newSegmentInitialUSD.toString(),
          createTransactionSignature: createResult.transactionId,
          notes: `Rebalanced from ${positionAddress} to new position`,
        });

        // Step 6: Update position
        const newTotalRealizedPnl = new Decimal(
          dbPosition.totalRealizedPnlUSD || "0"
        ).plus(segmentPnlUSD);

        await updatePosition(dbPosition.id, {
          positionAddress: createResult.positionId || positionAddress,
          status: "ACTIVE",
          currentSegmentNumber: dbPosition.currentSegmentNumber + 1,
          currentSegmentInitialUSD: newSegmentInitialUSD.toString(),
          currentSegmentStartAt: new Date(),
          totalRealizedPnlUSD: newTotalRealizedPnl.toString(),
          updatedAt: new Date(),
        });

        logger.info(
          `[Position] Rebalance completed successfully for position ${positionAddress}`
        );

        return {
          success: true,
          transactionId: createResult.transactionId,
          rebalanceEventId: rebalanceEvent.id,
        };
      } catch (error) {
        // Rollback position status
        await updatePosition(dbPosition.id, {
          status: "ACTIVE",
          updatedAt: new Date(),
        });
        throw error;
      }
    } catch (error) {
      logger.error(
        `[Position] Rebalance failed for position ${positionAddress}:`,
        error
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Close a position completely
   */
  async closePositionV1(
    user: User,
    poolAddress: string,
    positionAddress: string
  ): Promise<any> {
    try {
      logger.info(
        `[Position] Closing position ${positionAddress} for user ${user.id}`
      );

      const position = await getPositionsByAddress(positionAddress);
      if (!position) {
        throw new Error("Position not found");
      }

      if (position.status !== "ACTIVE") {
        throw new Error("Position is not active");
      }

      const currentSegment = await getCurrentSegment(position.id);
      if (!currentSegment) {
        throw new Error("No current segment found for position");
      }

      // Execute close transaction
      const { instructions } = await meteoraDlmmService.closePositionIx(
        new PublicKey(user.walletAddress),
        new PublicKey(poolAddress),
        new PublicKey(positionAddress)
      );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions,
        []
      );

      const result = await this.handlePositionClosedV1(
        user,
        position,
        currentSegment,
        transactionId
      );

      return {
        success: true,
        transactionId,
        ...result,
      };
    } catch (error) {
      logger.error(`[Position] Error closing position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  /**
   * Handle position closure with enhanced database operations
   */
  private async handlePositionClosedV1(
    user: User,
    position: Position,
    currentSegment: PositionSegment,
    signature: string
  ) {
    try {
      const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");

      const parsedTransaction = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
        }
      );

      if (!parsedTransaction) {
        throw new Error(`Transaction not found or not confirmed: ${signature}`);
      }

      const meteoraParsedIxs =
        await parseMeteoraInstructions(parsedTransaction);
      if (meteoraParsedIxs.length === 0) {
        throw new Error("No meteora instruction found");
      }

      const removeIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "remove" &&
          ix.instructionName === "remove_liquidity_by_range2"
      );

      const claimIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
      );

      if (!removeIx) {
        throw new Error("No remove liquidity instruction found");
      }

      const tokenMintX = position.tokenX?.address!;
      const tokenMintY = position.tokenY?.address!;

      const prices = await this.tokenPriceService.getPrices([
        tokenMintX,
        tokenMintY,
        SOL_MINT,
      ]);

      if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
        throw new Error("Failed to fetch token prices");
      }

      const priceXUSD = new Decimal(prices[tokenMintX].price);
      const priceYUSD = new Decimal(prices[tokenMintY].price);
      const solPriceUSD = new Decimal(prices[SOL_MINT]?.price || "0");

      const withdrawnTokenXAmount = new Decimal(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );

      const withdrawnTokenYAmount = new Decimal(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      let claimedTokenXAmount = new Decimal(0);
      let claimedTokenYAmount = new Decimal(0);

      if (claimIx) {
        claimedTokenXAmount = new Decimal(
          claimIx.tokenTransfers.find(
            (transfer) => transfer.mint === tokenMintX
          )?.amount ?? 0
        );
        claimedTokenYAmount = new Decimal(
          claimIx.tokenTransfers.find(
            (transfer) => transfer.mint === tokenMintY
          )?.amount ?? 0
        );
      }

      const withdrawnTokenXValueUSD = withdrawnTokenXAmount
        .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
        .mul(priceXUSD);

      const withdrawnTokenYValueUSD = withdrawnTokenYAmount
        .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
        .mul(priceYUSD);

      const claimedTokenXValueUSD = claimedTokenXAmount
        .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
        .mul(priceXUSD);

      const claimedTokenYValueUSD = claimedTokenYAmount
        .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
        .mul(priceYUSD);

      const totalWithdrawnUSD = withdrawnTokenXValueUSD.add(
        withdrawnTokenYValueUSD
      );
      const totalClaimedFeesUSD = claimedTokenXValueUSD.add(
        claimedTokenYValueUSD
      );
      const finalValueUSD = totalWithdrawnUSD.add(totalClaimedFeesUSD);

      // Swap all tokens to SOL
      let totalSolReceived = new Decimal(0);

      const [
        solFromWithdrawnX,
        solFromWithdrawnY,
        solFromClaimedX,
        solFromClaimedY,
      ] = await Promise.all([
        // Swap withdrawn Token X to SOL
        this.swapTokenToSol(user, tokenMintX, withdrawnTokenXAmount.toString()),
        // Swap withdrawn Token Y to SOL
        this.swapTokenToSol(user, tokenMintY, withdrawnTokenYAmount.toString()),
        // Swap claimed fee Token X to SOL
        this.swapTokenToSol(user, tokenMintX, claimedTokenXAmount.toString()),
        // Swap claimed fee Token Y to SOL
        this.swapTokenToSol(user, tokenMintY, claimedTokenYAmount.toString()),
      ]);

      totalSolReceived = solFromWithdrawnX
        .add(solFromWithdrawnY)
        .add(solFromClaimedX)
        .add(solFromClaimedY);

      // Calculate final PnL
      const initialValueUSD = new Decimal(position.initialValueUSD);
      const totalRealizedPnlUSD = new Decimal(
        position.totalRealizedPnlUSD || "0"
      );
      const segmentInitialUSD = new Decimal(currentSegment.initialValueUSD);

      // Final segment PnL
      const finalSegmentPnlUSD = finalValueUSD.minus(segmentInitialUSD);
      const finalSegmentPnlPercentage = segmentInitialUSD.gt(0)
        ? finalSegmentPnlUSD.div(segmentInitialUSD).mul(100)
        : new Decimal(0);

      // Total PnL including all segments
      const totalFinalPnlUSD = totalRealizedPnlUSD.add(finalSegmentPnlUSD);
      const totalFinalPnlPercentage = totalFinalPnlUSD
        .div(initialValueUSD)
        .mul(100);

      // Database operations in transaction
      await db.transaction(async (tx) => {
        // 1. Close current segment
        await tx
          .update(positionSegments)
          .set({
            endTimestamp: new Date(),
            finalValueUSD: finalValueUSD.toString(),
            realizedPnlUSD: finalSegmentPnlUSD.toString(),
            realizedPnlPercentage: finalSegmentPnlPercentage.toString(),
            closureReason: "manual_close",
            closureSignature: signature,
            endPositionAddress: position.positionAddress,
          })
          .where(eq(positionSegments.id, currentSegment.id));

        // 2. Update position as closed
        await tx
          .update(positions)
          .set({
            status: "CLOSED",
            closedAt: new Date(),
            totalRealizedPnlUSD: totalFinalPnlUSD.toString(),
            totalFeesClaimedUSD: new Decimal(
              position.totalFeesClaimedUSD || "0"
            )
              .add(totalClaimedFeesUSD)
              .toString(),
            finalValueUSD: finalValueUSD.toString(),
            finalValueSOL: totalSolReceived.toString(),
            finalTokenXAmount: withdrawnTokenXAmount.toString(),
            finalTokenYAmount: withdrawnTokenYAmount.toString(),
            finalTokenXPriceUSD: priceXUSD.toString(),
            finalTokenYPriceUSD: priceYUSD.toString(),
            closureSignature: signature,
            updatedAt: new Date(),
          })
          .where(eq(positions.id, position.id));

        // 3. Record final claim (if fees were claimed during closure)
        if (claimedTokenXAmount.gt(0) || claimedTokenYAmount.gt(0)) {
          await tx.insert(claimHistory).values({
            positionId: position.id,
            segmentId: currentSegment.id,
            timestamp: new Date(),
            claimType: "closure",
            claimedTokenXAmount: claimedTokenXAmount.toString(),
            claimedTokenYAmount: claimedTokenYAmount.toString(),
            claimedUSDValue: totalClaimedFeesUSD.toString(),
            tokenXPriceUSD: priceXUSD.toString(),
            tokenYPriceUSD: priceYUSD.toString(),
            solReceived: solFromClaimedX.add(solFromClaimedY).toString(),
            solPriceUSD: solPriceUSD.toString(),
            transactionSignature: signature,
            isDuringRebalance: false,
            notes: "Final fees claimed during position closure",
          });
        }

        // 4. Create final position snapshot
        await tx.insert(positionSnapshots).values({
          positionId: position.id,
          segmentId: currentSegment.id,
          snapshotType: "closure",
          currentValueUSD: finalValueUSD.toString(),
          tokenXAmount: withdrawnTokenXAmount.toString(),
          tokenYAmount: withdrawnTokenYAmount.toString(),
          unclaimedFeesX: "0", // All fees claimed
          unclaimedFeesY: "0",
          unclaimedFeesUSD: "0",
          unrealizedPnlUSD: "0", // Position closed, no more unrealized PnL
          unrealizedPnlPercentage: "0",
          totalPnlUSD: totalFinalPnlUSD.toString(),
          totalPnlPercentage: totalFinalPnlPercentage.toString(),
          tokenXPriceUSD: priceXUSD.toString(),
          tokenYPriceUSD: priceYUSD.toString(),
          solPriceUSD: solPriceUSD.toString(),
        });
      });

      logger.info(
        `[Position] Position closed successfully: ${position.id}, Final PnL: ${totalFinalPnlUSD.toString()} USD (${totalFinalPnlPercentage.toString()}%)`
      );

      return {
        finalPnlUSD: totalFinalPnlUSD.toString(),
        finalPnlPercentage: totalFinalPnlPercentage.toString(),
        totalFeesClaimedUSD: new Decimal(position.totalFeesClaimedUSD || "0")
          .add(totalClaimedFeesUSD)
          .toString(),
        finalValueUSD: finalValueUSD.toString(),
        solReceived: totalSolReceived.toString(),
      };
    } catch (error) {
      logger.error(
        `[Position] Error handling position closure: ${error}`,
        error
      );
      throw error;
    }
  }

  // private methods
  /**
   * Helper method to swap SOL to tokens (unchanged)
   */
  private async swapSolToToken(
    user: User,
    tokenAddress: string,
    amount: string
  ): Promise<Decimal> {
    if (tokenAddress === SOL_MINT) {
      return new Decimal(amount);
    }

    const order = await jupiterService.getOrder({
      inputMint: SOL_MINT,
      outputMint: tokenAddress,
      amount: amount,
      taker: user.walletAddress!,
    });

    const swapTxStr = order.transaction;
    if (!swapTxStr) {
      throw new Error("Failed to get swap transaction");
    }
    const swapTx = jupiterService.getOrderTransaction(swapTxStr);

    const { signedTransaction } = await WalletService.signTransaction(
      user,
      swapTx
    );

    const execute = await jupiterService.executeOrder({
      requestId: order.requestId,
      signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
        "base64"
      ),
    });

    if (execute.status === "Failed") {
      throw new Error(`Failed to convert SOL to token: ${execute.error}`);
    }

    return new Decimal(execute.outputAmountResult || "0");
  }

  /**
   * Helper method to swap tokens to SOL if needed
   */
  private async swapTokenToSol(
    user: User,
    tokenMint: string,
    amount: string
  ): Promise<Decimal> {
    if (new Decimal(amount).lte(0)) {
      return new Decimal(0);
    }

    if (tokenMint === SOL_MINT) {
      return new Decimal(amount).div(1e9); // Convert lamports to SOL
    }

    try {
      const order = await this.jupiterService.getOrder({
        inputMint: tokenMint,
        outputMint: SOL_MINT,
        amount,
        taker: user.walletAddress!,
      });

      if (!order.transaction) {
        throw new Error("Failed to get swap transaction");
      }

      const swapTx = this.jupiterService.getOrderTransaction(order.transaction);
      const { signedTransaction } = await WalletService.signTransaction(
        user,
        swapTx
      );

      const executeResult = await this.jupiterService.executeOrder({
        requestId: order.requestId,
        signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
          "base64"
        ),
      });

      if (executeResult.status === "Failed") {
        throw new Error(`Swap execution failed: ${executeResult.error}`);
      }

      const solReceived = new Decimal(
        executeResult.outputAmountResult || "0"
      ).div(1e9);

      return solReceived;
    } catch (error) {
      logger.warn(`[Position] Failed to swap ${tokenMint} to SOL: ${error}`);
      return new Decimal(0);
    }
  }

  /**
   * Helper method to create position snapshots
   */
  private async createPositionSnapshot(snapshotData: {
    positionId: string;
    segmentId?: string;
    snapshotType: "creation" | "claim" | "rebalance" | "closure" | "periodic";
    currentValueUSD: string;
    tokenXAmount: string;
    tokenYAmount: string;
    unclaimedFeesX: string;
    unclaimedFeesY: string;
    unclaimedFeesUSD: string;
    unrealizedPnlUSD: string;
    unrealizedPnlPercentage: string;
    totalPnlUSD: string;
    totalPnlPercentage: string;
    tokenXPriceUSD: string;
    tokenYPriceUSD: string;
    solPriceUSD: string;
  }) {
    return await db
      .insert(positionSnapshots)
      .values({
        positionId: snapshotData.positionId,
        segmentId: snapshotData.segmentId,
        snapshotType: snapshotData.snapshotType,
        currentValueUSD: snapshotData.currentValueUSD,
        tokenXAmount: snapshotData.tokenXAmount,
        tokenYAmount: snapshotData.tokenYAmount,
        unclaimedFeesX: snapshotData.unclaimedFeesX,
        unclaimedFeesY: snapshotData.unclaimedFeesY,
        unclaimedFeesUSD: snapshotData.unclaimedFeesUSD,
        unrealizedPnlUSD: snapshotData.unrealizedPnlUSD,
        unrealizedPnlPercentage: snapshotData.unrealizedPnlPercentage,
        totalPnlUSD: snapshotData.totalPnlUSD,
        totalPnlPercentage: snapshotData.totalPnlPercentage,
        tokenXPriceUSD: snapshotData.tokenXPriceUSD,
        tokenYPriceUSD: snapshotData.tokenYPriceUSD,
        solPriceUSD: snapshotData.solPriceUSD,
      })
      .returning();
  }

  /**
   * Create position snapshot with transaction support
   */
  private async createPositionSnapshotV1(
    tx: any, // Transaction context
    snapshotData: {
      positionId: string;
      segmentId?: string;
      snapshotType: "creation" | "claim" | "rebalance" | "closure" | "periodic";
      currentValueUSD: string;
      tokenXAmount: string;
      tokenYAmount: string;
      unclaimedFeesX: string;
      unclaimedFeesY: string;
      unclaimedFeesUSD: string;
      unrealizedPnlUSD: string;
      unrealizedPnlPercentage: string;
      totalPnlUSD: string;
      totalPnlPercentage: string;
      tokenXPriceUSD: string;
      tokenYPriceUSD: string;
      solPriceUSD: string;
    }
  ) {
    return await tx.insert(positionSnapshots).values({
      positionId: snapshotData.positionId,
      segmentId: snapshotData.segmentId,
      snapshotType: snapshotData.snapshotType,
      currentValueUSD: snapshotData.currentValueUSD,
      tokenXAmount: snapshotData.tokenXAmount,
      tokenYAmount: snapshotData.tokenYAmount,
      unclaimedFeesX: snapshotData.unclaimedFeesX,
      unclaimedFeesY: snapshotData.unclaimedFeesY,
      unclaimedFeesUSD: snapshotData.unclaimedFeesUSD,
      unrealizedPnlUSD: snapshotData.unrealizedPnlUSD,
      unrealizedPnlPercentage: snapshotData.unrealizedPnlPercentage,
      totalPnlUSD: snapshotData.totalPnlUSD,
      totalPnlPercentage: snapshotData.totalPnlPercentage,
      tokenXPriceUSD: snapshotData.tokenXPriceUSD,
      tokenYPriceUSD: snapshotData.tokenYPriceUSD,
      solPriceUSD: snapshotData.solPriceUSD,
    });
  }

  /**
   * Calculate position PnL with enhanced logic
   */
  private calculatePositionPnl(
    position: Position,
    lbPosition?: LbPosition,
    priceX?: TokenPrice,
    priceY?: TokenPrice
  ): PositionPnlResult & { currentValueUSD: string } {
    const initialValueUsd = new Decimal(position.initialValueUSD || "0");
    const totalRealizedPnlUsd = new Decimal(
      position.totalRealizedPnlUSD || "0"
    );
    const currentSegmentInitialUsd = new Decimal(
      position.currentSegmentInitialUSD || initialValueUsd.toString()
    );

    // For closed positions, use final values
    if (position.status === "CLOSED") {
      const finalValueUsd = new Decimal(position.finalValueUSD || "0");
      const realizedPnlUsd = totalRealizedPnlUsd.toNumber();
      const realizedPnlPercentage = finalValueUsd
        .div(initialValueUsd)
        .minus(1)
        .times(100)
        .toNumber();

      return {
        pnlUsd: realizedPnlUsd,
        pnlPercentage: realizedPnlPercentage,
        unrealizedPnlUsd: 0,
        unrealizedPnlPercentage: 0,
        currentValueUSD: finalValueUsd.toString(),
      };
    }

    // For active positions, calculate unrealized PNL
    if (!lbPosition || !priceX || !priceY) {
      throw new Error("Current position data required for active positions");
    }

    const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
      new Decimal(10).pow(new Decimal(priceX.decimals))
    );
    const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
      new Decimal(10).pow(new Decimal(priceY.decimals))
    );

    const tokenXUSD = totalXAmount.mul(priceX.price);
    const tokenYUSD = totalYAmount.mul(priceY.price);
    const totalUSD = tokenXUSD.add(tokenYUSD);

    const unclaimedFeesX = new Decimal(
      lbPosition.positionData.feeX.toString()
    ).div(new Decimal(10).pow(new Decimal(priceX.decimals)));
    const unclaimedFeesY = new Decimal(
      lbPosition.positionData.feeY.toString()
    ).div(new Decimal(10).pow(new Decimal(priceY.decimals)));
    const unclaimedFeesXUSD = unclaimedFeesX.mul(priceX.price);
    const unclaimedFeesYUSD = unclaimedFeesY.mul(priceY.price);
    const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

    const currentValueUsd = totalUSD.add(totalUnclaimedFeesUSD);

    // Calculate unrealized PNL based on rebalancing status
    let unrealizedPnlUsd: Decimal;
    let unrealizedPnlPercentage: Decimal;

    if (position.isRebalancingEnabled) {
      // With rebalancing: Calculate segment unrealized + cumulative
      const segmentUnrealizedUsd = currentValueUsd.minus(
        currentSegmentInitialUsd
      );
      unrealizedPnlUsd = totalRealizedPnlUsd.plus(segmentUnrealizedUsd);
      unrealizedPnlPercentage = unrealizedPnlUsd
        .div(initialValueUsd)
        .times(100);
    } else {
      // Without rebalancing: Simple calculation
      const positionUnrealizedUsd = currentValueUsd.minus(initialValueUsd);
      unrealizedPnlUsd = positionUnrealizedUsd.plus(totalRealizedPnlUsd);
      unrealizedPnlPercentage = currentValueUsd
        .plus(totalRealizedPnlUsd)
        .div(initialValueUsd)
        .minus(1)
        .times(100);
    }

    return {
      pnlUsd: unrealizedPnlUsd.toNumber(),
      pnlPercentage: unrealizedPnlPercentage.toNumber(),
      unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
      unrealizedPnlPercentage: unrealizedPnlPercentage.toNumber(),
      currentValueUSD: currentValueUsd.toString(),
    };
  }

  /**
   * Close position and convert all tokens to SOL
   */
  private async closeAndConvertToSol(
    user: User,
    position: Position,
    poolInfo: any
  ): Promise<{ totalSolReceived: Decimal }> {
    try {
      logger.debug(`[Position] Closing position and converting to SOL...`);

      // Step 1: Close current position
      const { instructions } = await meteoraDlmmService.closePositionIx(
        new PublicKey(user.walletAddress),
        new PublicKey(position.poolAddress),
        new PublicKey(position.positionAddress)
      );

      const closeSignature = await WalletService.signAndSendTransaction(
        user,
        instructions,
        []
      );

      logger.debug(
        `[Position] Position closed with signature: ${closeSignature}`
      );

      // Step 2: Get wallet balances after position closure
      const connection = new Connection(CONFIG.SOLANA.RPC_URL);
      const userWallet = new PublicKey(user.walletAddress!);

      // Wait a bit for transaction to settle
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get token balances
      const [tokenABalance, tokenBBalance] = await Promise.all([
        this.getTokenBalance(connection, userWallet, poolInfo.tokenA.address),
        this.getTokenBalance(connection, userWallet, poolInfo.tokenB.address),
      ]);

      logger.debug(
        `[Position] Token balances - A: ${tokenABalance}, B: ${tokenBBalance}`
      );

      // Step 3: Swap both tokens to SOL
      let totalSolReceived = new Decimal(0);

      // Swap Token A to SOL if not already SOL
      if (poolInfo.tokenA.address !== SOL_MINT && tokenABalance > 0) {
        logger.debug(`[Position] Swapping Token A to SOL...`);
        const solFromA = await this.swapTokenToSol(
          user,
          poolInfo.tokenA.address,
          (tokenABalance * Math.pow(10, poolInfo.tokenA.decimals)).toString()
        );
        totalSolReceived = totalSolReceived.plus(solFromA);
      } else if (poolInfo.tokenA.address === SOL_MINT) {
        totalSolReceived = totalSolReceived.plus(tokenABalance);
      }

      // Swap Token B to SOL if not already SOL
      if (poolInfo.tokenB.address !== SOL_MINT && tokenBBalance > 0) {
        logger.debug(`[Position] Swapping Token B to SOL...`);
        const solFromB = await this.swapTokenToSol(
          user,
          poolInfo.tokenB.address,
          (tokenBBalance * Math.pow(10, poolInfo.tokenB.decimals)).toString()
        );
        totalSolReceived = totalSolReceived.plus(solFromB);
      } else if (poolInfo.tokenB.address === SOL_MINT) {
        totalSolReceived = totalSolReceived.plus(tokenBBalance);
      }

      logger.debug(
        `[Position] Total SOL received: ${totalSolReceived.toString()}`
      );

      if (totalSolReceived.lte(0)) {
        throw new Error("No SOL received from token swaps");
      }

      return { totalSolReceived };
    } catch (error) {
      logger.error(`[Position] Error in closeAndConvertToSol:`, error);
      throw error;
    }
  }

  /**
   * Helper method to get token balance
   */
  private async getTokenBalance(
    connection: Connection,
    wallet: PublicKey,
    tokenMint: string
  ): Promise<number> {
    try {
      if (tokenMint === SOL_MINT) {
        const balance = await connection.getBalance(wallet);
        return balance / 1e9; // Convert lamports to SOL
      } else {
        // Get SPL token balance
        const tokenAccounts = await connection.getTokenAccountsByOwner(wallet, {
          mint: new PublicKey(tokenMint),
        });

        if (tokenAccounts.value.length === 0) {
          return 0;
        }

        const accountInfo = await connection.getTokenAccountBalance(
          tokenAccounts.value[0].pubkey
        );

        return (
          parseFloat(accountInfo.value.amount) /
          Math.pow(10, accountInfo.value.decimals)
        );
      }
    } catch (error) {
      logger.error(`[Position] Failed to get token balance:`, error);
      return 0;
    }
  }

  /**
   * Get Meteora strategy configuration
   */
  private getMeteoraStrategy(inputStrategy: MeteoraCreatePositionStrategy): {
    strategy: StrategyType;
    dbStrategyType: "DLMM" | "DAMM" | "CONCENTRATED";
  } {
    let strategy: StrategyType;
    let dbStrategyType: "DLMM" | "DAMM" | "CONCENTRATED";

    switch (inputStrategy) {
      case "spot":
        strategy = StrategyType.Spot;
        dbStrategyType = "DLMM";
        break;
      case "curve":
        strategy = StrategyType.Curve;
        dbStrategyType = "DLMM";
        break;
      case "bid-ask":
        strategy = StrategyType.BidAsk;
        dbStrategyType = "DLMM";
        break;
      default:
        strategy = StrategyType.Spot;
        dbStrategyType = "DLMM";
    }

    return { strategy, dbStrategyType };
  }
}

export const positionService = new PositionService();

// async createBalancedPosition(
//   user: User,
//   poolAddress: string,
//   selectedStrategy: MeteoraCreatePositionStrategy,
//   enteredAmount: number,
//   autoRebalancing: boolean
// ): Promise<{
//   success: boolean;
//   transactionId?: string;
//   error?: string;
//   positionId?: string;
// }> {
//   try {
//     logger.info(
//       `[Position] Creating ${selectedStrategy} position for user ${user.id}`
//     );

//     const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
//     const amount = enteredAmount - feeAmount;

//     const poolInfo = await poolService.getPoolV2(poolAddress);
//     if (!poolInfo) {
//       throw new Error("Pool not found");
//     }

//     const { strategy } = this.getMeteoraStrategy(selectedStrategy);

//     const halfAmount = amount / 2;
//     const halfAmountLamports = (halfAmount * 1e9).toString();

//     logger.debug(`[Position] Starting SOL to Token A & B conversions...`);

//     const [tokenAAmount, tokenBAmount] = await Promise.all([
//       // Token A swap
//       (async () => {
//         if (poolInfo.tokenA.address !== SOL_MINT) {
//           try {
//             logger.debug(`[Position] Starting SOL to Token A conversion...`);
//             const orderA = await jupiterService.getOrder({
//               inputMint: SOL_MINT,
//               outputMint: poolInfo.tokenA.address,
//               amount: halfAmountLamports,
//               taker: user.walletAddress!,
//             });

//             const swapTxStr = orderA.transaction;
//             if (!swapTxStr) {
//               throw new Error("Failed to get swap transaction for Token A");
//             }
//             const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//             const { signedTransaction } = await WalletService.signTransaction(
//               user,
//               swapTx
//             );

//             const executeA = await jupiterService.executeOrder({
//               requestId: orderA.requestId,
//               signedTransaction: Buffer.from(
//                 signedTransaction.serialize()
//               ).toString("base64"),
//             });

//             if (executeA.status === "Failed") {
//               throw new Error(
//                 `Failed to convert SOL to token A: ${executeA.error}`
//               );
//             }

//             return new BN(executeA.outputAmountResult || "0");
//           } catch (error) {
//             logger.error("Error converting SOL to token A:", error);
//             throw error;
//           }
//         } else {
//           return new BN(halfAmountLamports);
//         }
//       })(),

//       // Token B swap
//       (async () => {
//         if (poolInfo.tokenB.address !== SOL_MINT) {
//           try {
//             logger.debug(`[Position] Starting SOL to Token B conversion...`);
//             const orderB = await jupiterService.getOrder({
//               inputMint: SOL_MINT,
//               outputMint: poolInfo.tokenB.address,
//               amount: halfAmountLamports,
//               taker: user.walletAddress!,
//             });

//             const swapTxStr = orderB.transaction;
//             if (!swapTxStr) {
//               throw new Error("Failed to get swap transaction for Token B");
//             }
//             const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//             const { signedTransaction } = await WalletService.signTransaction(
//               user,
//               swapTx
//             );

//             const executeB = await jupiterService.executeOrder({
//               requestId: orderB.requestId,
//               signedTransaction: Buffer.from(
//                 signedTransaction.serialize()
//               ).toString("base64"),
//             });

//             if (executeB.status === "Failed") {
//               throw new Error(
//                 `Failed to convert SOL to token B: ${executeB.error}`
//               );
//             }

//             return new BN(executeB.outputAmountResult || "0");
//           } catch (error) {
//             logger.error("Error converting SOL to token B:", error);
//             throw error;
//           }
//         } else {
//           return new BN(halfAmountLamports);
//         }
//       })(),
//     ]);

//     if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
//       throw new Error("Failed to convert SOL to token A or token B");
//     }

//     const positionKp = Keypair.generate();

//     const { instructions } = await meteoraDlmmService.createPositionIx(
//       positionKp.publicKey,
//       new PublicKey(poolAddress),
//       new PublicKey(user.walletAddress!),
//       tokenAAmount,
//       tokenBAmount,
//       strategy,
//       user.balancedPositionBinRange
//     );

//     const signature = await WalletService.signAndSendTransaction(
//       user,
//       instructions,
//       [positionKp]
//     );

//     this.handlePositionCreated(user, amount, autoRebalancing, signature);

//     return {
//       success: true,
//       transactionId: signature,
//     };
//   } catch (error) {
//     console.error(`[Position] Error creating position:`, error);
//     return {
//       success: false,
//       error:
//         error instanceof Error ? error.message : "Failed to create position",
//     };
//   }
// }

// async closePosition(
//   user: User,
//   poolAddress: string,
//   positionAddress: string
// ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
//   try {
//     logger.info(
//       `[Position] Closing position ${positionAddress} for user ${user.id}`
//     );

//     const position = await db.query.positions.findFirst({
//       where: eq(positions.positionAddress, positionAddress),
//     });

//     if (!position) {
//       throw new Error("Position not found");
//     }

//     const { instructions } = await meteoraDlmmService.closePositionIx(
//       new PublicKey(user.walletAddress),
//       new PublicKey(poolAddress),
//       new PublicKey(positionAddress)
//     );

//     const transactionId = await WalletService.signAndSendTransaction(
//       user,
//       instructions,
//       []
//     );

//     await this.handlePositionClosed(user, position, transactionId);

//     return {
//       success: true,
//       transactionId,
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error:
//         error instanceof Error ? error.message : "Failed to close position",
//     };
//   }
// }

// async claimFee(
//   user: User,
//   positionId: string
// ): Promise<{
//   success: boolean;
//   transactionId?: string;
//   claimedFeeXAmount?: string;
//   claimedFeeXValueUSD?: string;
//   claimedFeeYAmount?: string;
//   claimedFeeYValueUSD?: string;
//   totalClaimedFeeUSD?: string;
//   totalClaimedFees?: string;
//   cumulativePnL?: string;
//   error?: string;
// }> {
//   try {
//     logger.info(
//       `[Position] Claiming fee for position ${positionId} for user ${user.id}`
//     );

//     const position = await db.query.positions.findFirst({
//       where: eq(positions.id, positionId),
//     });

//     if (!position) {
//       throw new Error("Position not found");
//     }

//     const { instructions } = await meteoraDlmmService.claimFeesIx(
//       new PublicKey(user.walletAddress),
//       new PublicKey(position.poolAddress),
//       new PublicKey(position.positionAddress)
//     );

//     const transactionId = await WalletService.signAndSendTransaction(
//       user,
//       instructions,
//       []
//     );

//     console.log("transactionId", transactionId);

//     const result = await this.handleFeeClaimed(user, position, transactionId);

//     return {
//       success: true,
//       transactionId,
//       ...result,
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error: error instanceof Error ? error.message : "Failed to claim fee",
//     };
//   }
// }

// async rebalance(
//   user: User,
//   positionAddress: string
// ): Promise<{
//   success: boolean;
//   transactionId?: string;
//   error?: string;
//   rebalanceEventId?: string;
// }> {
//   try {
//     logger.info(
//       `[Position] Starting rebalance for position ${positionAddress}`
//     );

//     // Get position details
//     const dbPosition = await getPositionsByAddress(positionAddress);
//     if (!dbPosition) {
//       throw new Error("Position not found");
//     }

//     // Update position status to REBALANCING
//     await updatePosition(dbPosition.id, {
//       status: "REBALANCING",
//       updatedAt: new Date(),
//     });

//     const poolInfo = await poolService.getPoolV2(dbPosition.poolAddress);
//     if (!poolInfo) {
//       throw new Error("Pool not found");
//     }

//     // Get current position data for PnL calculation
//     const { lbPosition, lbPair } = await this.getLbPositionAndLbPair(
//       dbPosition.poolAddress,
//       positionAddress
//     );

//     if (!lbPosition || !lbPair) {
//       throw new Error("Failed to fetch position data from Meteora");
//     }

//     // Get current token prices
//     const prices = await this.tokenPriceService.getPrices([
//       poolInfo.tokenA.address,
//       poolInfo.tokenB.address,
//     ]);

//     const priceX = prices[poolInfo.tokenA.address];
//     const priceY = prices[poolInfo.tokenB.address];

//     if (!priceX || !priceY) {
//       throw new Error("Failed to fetch token prices");
//     }

//     // Calculate current segment PnL before closing
//     const currentSegmentInitialUSD = new Decimal(
//       dbPosition.currentSegmentInitialUSD || dbPosition.initialValueUSD
//     );
//     const pnlResult = this.calculatePositionPnl(
//       dbPosition,
//       lbPosition,
//       priceX,
//       priceY
//     );
//     const segmentFinalUSD = new Decimal(pnlResult.currentValueUSD);
//     const segmentPnlUSD = segmentFinalUSD.minus(currentSegmentInitialUSD);
//     const segmentPnlPct = currentSegmentInitialUSD.gt(0)
//       ? segmentPnlUSD.div(currentSegmentInitialUSD).mul(100)
//       : new Decimal(0);

//     logger.debug(
//       `[Position] Segment PnL: ${segmentPnlUSD.toString()} USD (${segmentPnlPct.toString()}%)`
//     );

//     // Step 1: Close current position
//     logger.debug(`[Position] Closing current position...`);
//     const closeResult = await meteoraPositionService.closePosition(
//       user.walletAddress!,
//       dbPosition.poolAddress,
//       positionAddress
//     );

//     if (!closeResult.success || !closeResult.signature) {
//       throw new Error(`Failed to close position: ${closeResult.error}`);
//     }

//     // Step 2: Claim any remaining fees
//     logger.debug(`[Position] Claiming remaining fees...`);
//     try {
//       const claimResult = await meteoraPositionService.claimFee(
//         user.walletAddress!,
//         dbPosition.poolAddress,
//         positionAddress
//       );

//       if (claimResult.success && claimResult.signature) {
//         logger.debug(`[Position] Fees claimed successfully`);
//       }
//     } catch (claimError) {
//       logger.warn(
//         `[Position] Fee claim failed during rebalance: ${claimError}`
//       );
//       // Continue with rebalance even if fee claim fails
//     }

//     // Step 3: Get wallet balances after position closure
//     const connection = new Connection(CONFIG.SOLANA.RPC_URL);
//     const userWallet = new PublicKey(user.walletAddress!);

//     // Get token balances
//     const [tokenABalance, tokenBBalance] = await Promise.all([
//       this.getTokenBalance(connection, userWallet, poolInfo.tokenA.address),
//       this.getTokenBalance(connection, userWallet, poolInfo.tokenB.address),
//     ]);

//     logger.debug(
//       `[Position] Token balances - A: ${tokenABalance}, B: ${tokenBBalance}`
//     );

//     // Step 4: Swap both tokens to SOL
//     let totalSolReceived = new Decimal(0);

//     // Swap Token A to SOL if not already SOL
//     if (poolInfo.tokenA.address !== SOL_MINT && tokenABalance > 0) {
//       logger.debug(`[Position] Swapping Token A to SOL...`);
//       const swapAResult = await this.swapTokenToSol(
//         user,
//         poolInfo.tokenA.address,
//         tokenABalance.toString()
//       );

//       if (swapAResult.success && swapAResult.solReceived) {
//         totalSolReceived = totalSolReceived.plus(swapAResult.solReceived);
//       }
//     } else if (poolInfo.tokenA.address === SOL_MINT) {
//       totalSolReceived = totalSolReceived.plus(tokenABalance);
//     }

//     // Swap Token B to SOL if not already SOL
//     if (poolInfo.tokenB.address !== SOL_MINT && tokenBBalance > 0) {
//       logger.debug(`[Position] Swapping Token B to SOL...`);
//       const swapBResult = await this.swapTokenToSol(
//         user,
//         poolInfo.tokenB.address,
//         tokenBBalance.toString()
//       );

//       if (swapBResult.success && swapBResult.solReceived) {
//         totalSolReceived = totalSolReceived.plus(swapBResult.solReceived);
//       }
//     } else if (poolInfo.tokenB.address === SOL_MINT) {
//       totalSolReceived = totalSolReceived.plus(tokenBBalance);
//     }

//     logger.debug(
//       `[Position] Total SOL received: ${totalSolReceived.toString()}`
//     );

//     if (totalSolReceived.lte(0)) {
//       throw new Error("No SOL received from token swaps");
//     }

//     // Step 5: Create new balanced position with the SOL
//     logger.debug(`[Position] Creating new balanced position...`);
//     const newPositionAmount = totalSolReceived.toNumber();

//     // Use the same strategy as the original position
//     const strategyType =
//       dbPosition.strategyType as MeteoraCreatePositionStrategy;

//     const createResult = await this.createBalancedPosition(
//       user,
//       dbPosition.poolAddress,
//       strategyType,
//       newPositionAmount,
//       dbPosition.isRebalancingEnabled || false
//     );

//     if (!createResult.success || !createResult.transactionId) {
//       throw new Error(`Failed to create new position: ${createResult.error}`);
//     }

//     // Step 6: Create rebalance event record
//     const rebalanceEvent = await db
//       .insert(rebalanceEvents)
//       .values({
//         positionId: dbPosition.id,
//         timestamp: new Date(),
//         oldPositionAddress: positionAddress,
//         newPositionAddress: createResult.positionId || "pending",
//         segmentFinalUSD: segmentFinalUSD.toString(),
//         segmentPnlUSD: segmentPnlUSD.toString(),
//         segmentPnlPct: segmentPnlPct.toString(),
//         oldValue: currentSegmentInitialUSD.toString(),
//         newValue: totalSolReceived.mul(priceX?.price || 1).toString(),
//         feesCollected: "0", // Fees were claimed separately
//         reason: "Manual rebalance",
//         txHash: createResult.transactionId,
//         notes: `Rebalanced from ${positionAddress} to new position`,
//       })
//       .returning();

//     // Step 7: Update position with new values
//     const newCumulativePnl = new Decimal(
//       dbPosition.cumulativeAbsolutePnlUSD || "0"
//     ).plus(segmentPnlUSD);

//     await updatePosition(dbPosition.id, {
//       positionAddress: createResult.positionId || positionAddress,
//       status: "ACTIVE",
//       lastRebalanceAt: new Date(),
//       cumulativeAbsolutePnlUSD: newCumulativePnl.toString(),
//       currentSegmentInitialUSD: totalSolReceived
//         .mul(priceX?.price || 1)
//         .toString(),
//       updatedAt: new Date(),
//     });

//     logger.info(
//       `[Position] Rebalance completed successfully for position ${positionAddress}`
//     );

//     return {
//       success: true,
//       transactionId: createResult.transactionId,
//       rebalanceEventId: rebalanceEvent[0]?.id,
//     };
//   } catch (error) {
//     logger.error(
//       `[Position] Rebalance failed for position ${positionAddress}:`,
//       error
//     );

//     // Rollback: Update position status back to ACTIVE if it was changed
//     try {
//       const dbPosition = await getPositionsByAddress(positionAddress);
//       if (dbPosition && dbPosition.status === "REBALANCING") {
//         await updatePosition(dbPosition.id, {
//           status: "ACTIVE",
//           updatedAt: new Date(),
//         });
//       }
//     } catch (rollbackError) {
//       logger.error(
//         `[Position] Failed to rollback position status:`,
//         rollbackError
//       );
//     }

//     return {
//       success: false,
//       error:
//         error instanceof Error ? error.message : "Unknown error occurred",
//     };
//   }
// }

// // Helper method to swap tokens to SOL
// private async swapTokenToSol(
//   user: User,
//   tokenMint: string,
//   amount: string
// ): Promise<{
//   success: boolean;
//   solReceived?: Decimal;
//   error?: string;
// }> {
//   try {
//     const order = await this.jupiterService.getOrder({
//       inputMint: tokenMint,
//       outputMint: SOL_MINT,
//       amount,
//       taker: user.walletAddress!,
//     });

//     if (!order.transaction) {
//       throw new Error("Failed to get swap transaction");
//     }

//     const swapTx = this.jupiterService.getOrderTransaction(order.transaction);
//     const { signedTransaction } = await WalletService.signTransaction(
//       user,
//       swapTx
//     );

//     const executeResult = await this.jupiterService.executeOrder({
//       requestId: order.requestId,
//       signedTransaction: Buffer.from(signedTransaction.serialize()).toString(
//         "base64"
//       ),
//     });

//     if (executeResult.status === "Failed") {
//       throw new Error(`Swap execution failed: ${executeResult.error}`);
//     }

//     // Calculate SOL received
//     const solReceived = new Decimal(
//       executeResult.outputAmountResult || "0"
//     ).div(1e9);

//     return {
//       success: true,
//       solReceived,
//     };
//   } catch (error) {
//     logger.error(`[Position] Token to SOL swap failed:`, error);
//     return {
//       success: false,
//       error: error instanceof Error ? error.message : "Swap failed",
//     };
//   }
// }

// // Helper method to get token balance
// private async getTokenBalance(
//   connection: Connection,
//   wallet: PublicKey,
//   tokenMint: string
// ): Promise<number> {
//   try {
//     if (tokenMint === SOL_MINT) {
//       const balance = await connection.getBalance(wallet);
//       return balance / 1e9; // Convert lamports to SOL
//     } else {
//       // Get SPL token balance
//       const tokenAccounts = await connection.getTokenAccountsByOwner(wallet, {
//         mint: new PublicKey(tokenMint),
//       });

//       if (tokenAccounts.value.length === 0) {
//         return 0;
//       }

//       const accountInfo = await connection.getTokenAccountBalance(
//         tokenAccounts.value[0].pubkey
//       );

//       return (
//         parseFloat(accountInfo.value.amount) /
//         Math.pow(10, accountInfo.value.decimals)
//       );
//     }
//   } catch (error) {
//     logger.error(`[Position] Failed to get token balance:`, error);
//     return 0;
//   }
// }

// async getPositionDetail(positionAddress: string) {
//   try {
//     const dbPosition = await getPositionsByAddress(positionAddress);
//     if (!dbPosition) {
//       throw new Error("Position not found");
//     }

//     const { lbPosition, lbPair } = await this.getLbPositionAndLbPair(
//       dbPosition.poolAddress,
//       positionAddress
//     );

//     return { dbPosition, lbPosition, lbPair };
//   } catch (error) {
//     console.error(
//       `[Meteora] Error fetching DLMM position ${positionAddress}:`,
//       error
//     );
//     throw error;
//   }
// }

// async getLbPositionAndLbPair(poolAddress: string, positionAddress: string) {
//   try {
//     const { lbPosition, lbPair } = await meteoraDlmmService.getPosition(
//       positionAddress,
//       poolAddress
//     );

//     return { lbPosition, lbPair };
//   } catch (error) {
//     console.error(
//       `[Meteora] Error fetching DLMM position ${positionAddress}:`,
//       error
//     );
//     throw error;
//   }
// }

// calculatePositionPnl(
//   position: Position,
//   lbPosition?: LbPosition,
//   priceX?: TokenPrice,
//   priceY?: TokenPrice
// ): PositionPnlResult & { currentValueUSD: string } {
//   const initialValueUsd = new Decimal(position.initialValueUSD || "0");
//   const cumulativeAbsolutePnlUsd = new Decimal(
//     position.cumulativeAbsolutePnlUSD || "0"
//   );
//   const currentSegmentInitialUsd = new Decimal(
//     position.currentSegmentInitialUSD || initialValueUsd.toString()
//   );

//   // For closed positions, use final values
//   if (position.status === "CLOSED") {
//     const finalValueUsd = new Decimal(position.finalValueUSD || "0");
//     const realizedPnlUsd = cumulativeAbsolutePnlUsd.toNumber();
//     const realizedPnlPercentage = finalValueUsd
//       .div(initialValueUsd)
//       .minus(1)
//       .times(100)
//       .toNumber();

//     return {
//       pnlUsd: realizedPnlUsd,
//       pnlPercentage: realizedPnlPercentage,
//       unrealizedPnlUsd: 0,
//       unrealizedPnlPercentage: 0,
//     };
//   }

//   // For active positions, calculate unrealized PNL
//   if (!lbPosition || !priceX || !priceY) {
//     throw new Error("Current position data required for active positions");
//   }

//   const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
//     new Decimal(10).pow(new Decimal(priceX.decimals))
//   );
//   const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
//     new Decimal(10).pow(new Decimal(priceY.decimals))
//   );

//   const tokenXUSD = totalXAmount.mul(priceX.price);
//   const tokenYUSD = totalYAmount.mul(priceY.price);
//   const totalUSD = tokenXUSD.add(tokenYUSD);

//   const unclaimedFeesX = new Decimal(
//     lbPosition.positionData.feeX.toString()
//   ).div(new Decimal(10).pow(new Decimal(priceX.decimals)));
//   const unclaimedFeesY = new Decimal(
//     lbPosition.positionData.feeY.toString()
//   ).div(new Decimal(10).pow(new Decimal(priceY.decimals)));
//   const unclaimedFeesXUSD = unclaimedFeesX.mul(priceX.price);
//   const unclaimedFeesYUSD = unclaimedFeesY.mul(priceY.price);
//   const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

//   const currentValueUsd = totalUSD.add(totalUnclaimedFeesUSD);

//   // Calculate unrealized PNL based on rebalancing status
//   let unrealizedPnlUsd: Decimal;
//   let unrealizedPnlPercentage: Decimal;

//   if (position.isRebalancingEnabled) {
//     // With rebalancing: Calculate segment unrealized + cumulative
//     const segmentUnrealizedUsd = currentValueUsd.minus(
//       currentSegmentInitialUsd
//     );
//     unrealizedPnlUsd = cumulativeAbsolutePnlUsd.plus(segmentUnrealizedUsd);
//     unrealizedPnlPercentage = unrealizedPnlUsd
//       .div(initialValueUsd)
//       .minus(1)
//       .times(100);
//   } else {
//     // Without rebalancing: Simple calculation
//     const positionUnrealizedUsd = currentValueUsd.minus(initialValueUsd);
//     unrealizedPnlUsd = positionUnrealizedUsd.plus(cumulativeAbsolutePnlUsd);
//     unrealizedPnlPercentage = currentValueUsd
//       .plus(cumulativeAbsolutePnlUsd)
//       .div(initialValueUsd)
//       .minus(1)
//       .times(100);
//   }

//   return {
//     pnlUsd: unrealizedPnlUsd.toNumber(),
//     pnlPercentage: unrealizedPnlPercentage.toNumber(),
//     unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
//     unrealizedPnlPercentage: unrealizedPnlPercentage.toNumber(),
//     currentValueUSD: currentValueUsd.toString(),
//   };
// }

// private getMeteoraStrategy(inputStrategy: MeteoraCreatePositionStrategy): {
//   strategy: StrategyType;
//   dbStrategyType: "DLMM" | "DAMM" | "CONCENTRATED";
// } {
//   let strategy: StrategyType;
//   let dbStrategyType: "DLMM" | "DAMM" | "CONCENTRATED";
//   switch (inputStrategy) {
//     case "spot":
//       strategy = StrategyType.Spot;
//       dbStrategyType = "DLMM";
//       break;
//     case "curve":
//       strategy = StrategyType.Curve;
//       dbStrategyType = "DLMM";
//       break;
//     case "bid-ask":
//       strategy = StrategyType.BidAsk;
//       dbStrategyType = "DLMM";
//       break;
//     default:
//       strategy = StrategyType.Spot;
//       dbStrategyType = "DLMM";
//   }

//   return { strategy, dbStrategyType };
// }

// private async handlePositionCreated(
//   user: User,
//   amount: number,
//   autoRebalancing: boolean,
//   signature: string
// ) {
//   try {
//     const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
//     // FIXME: add retry logic
//     const parsedTransaction = await connection.getParsedTransaction(
//       signature,
//       {
//         maxSupportedTransactionVersion: 0,
//       }
//     );

//     if (!parsedTransaction) {
//       throw new Error(`Transaction not found or not confirmed: ${signature}`);
//     }

//     const meteoraParsedIxs =
//       await parseMeteoraInstructions(parsedTransaction);
//     if (meteoraParsedIxs.length === 0) {
//       throw new Error("No meteora instruction found");
//     }

//     const openIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "open" &&
//         ix.instructionName === "initialize_position"
//     );

//     const addIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "add" &&
//         ix.instructionName === "add_liquidity_by_strategy2"
//     );

//     if (!openIx || !addIx) {
//       throw new Error("No meteora instruction found");
//     }

//     const positionAddress = openIx.accounts.position;
//     const poolAddress = openIx.accounts.lbPair;
//     const mintX = addIx.accounts.tokenXMint;
//     const mintY = addIx.accounts.tokenYMint;

//     if (!mintX || !mintY) {
//       throw new Error("No token mint found");
//     }

//     const { tokenX: jupiterTokenX, tokenY: jupiterTokenY } =
//       await this.jupiterService.getTokenPairInfo(mintX, mintY);

//     const tokenX = this.tokenAdapter.transformToken(jupiterTokenX);
//     const tokenY = this.tokenAdapter.transformToken(jupiterTokenY);

//     const prices = await this.tokenPriceService.getPrices([
//       tokenX.address,
//       tokenY.address,
//     ]);

//     if (!prices || !prices[tokenX.address] || !prices[tokenY.address]) {
//       throw new Error("No token price found");
//     }

//     const amountX =
//       addIx.tokenTransfers.find(
//         (transfer) => transfer.mint === addIx.accounts.tokenXMint
//       )?.amount ?? 0;

//     const amountY =
//       addIx.tokenTransfers.find(
//         (transfer) => transfer.mint === addIx.accounts.tokenYMint
//       )?.amount ?? 0;

//     if (amountX === 0 || amountY === 0) {
//       throw new Error("No token amount found");
//     }

//     const priceXUSD = new Decimal(prices[tokenX.address].price);
//     const priceYUSD = new Decimal(prices[tokenY.address].price);

//     const tokenXValueUSD = new Decimal(amountX)
//       .div(new Decimal(10).pow(tokenX.decimals))
//       .mul(priceXUSD);

//     const tokenYValueUSD = new Decimal(amountY)
//       .div(new Decimal(10).pow(tokenY.decimals))
//       .mul(priceYUSD);

//     const initialValueUSD = tokenXValueUSD.add(tokenYValueUSD);
//     const initialValueSOL = new Decimal(amount)
//       .mul(new Decimal(10).pow(9))
//       .toString();

//     const newPos = await createPosition({
//       userId: user.id,
//       positionAddress,
//       poolAddress,
//       tokenX,
//       tokenY,
//       strategyType: "DLMM",
//       status: "ACTIVE",
//       creationSignature: signature,

//       // pnl tracking
//       initialValueUSD: initialValueUSD.toString(),
//       initialValueSOL: initialValueSOL.toString(),
//       cumulativeAbsolutePnlUSD: "0",
//       currentSegmentInitialUSD: initialValueUSD.toString(),

//       // Rebalancing
//       isRebalancingEnabled: autoRebalancing,

//       depositTokenXAmount: amountX.toString(),
//       depositTokenYAmount: amountY.toString(),
//       tokenXPriceAtCreation: priceXUSD.toString(),
//       tokenYPriceAtCreation: priceYUSD.toString(),

//       withdrawTokenXAmount: "0",
//       withdrawTokenYAmount: "0",
//       tokenXPriceAtClosure: "0",
//       tokenYPriceAtClosure: "0",

//       feeTokenXAmount: "0",
//       feeTokenYAmount: "0",

//       finalValueSol: "0",
//       finalValueUSD: "0",
//       feesEarnedInSol: "0",
//       pnlInSol: "0",
//       pnlInUsd: "0",
//       pnlPercentage: "0",
//     });

//     console.log("new Position", newPos);

//     if (newPos) {
//       await this.createInitialPositionSnapshot(
//         newPos.id,
//         priceXUSD,
//         priceYUSD,
//         initialValueUSD,
//         amountX.toString(),
//         amountY.toString()
//       );

//       // this.queuePositionMonitorJob({
//       //   positionId: newPos.id,
//       //   userId,
//       // });
//     }
//   } catch (error) {
//     console.error(error);
//     logger.error(
//       `[Position] Error handling position created: ${error}`,
//       error
//     );
//   }
// }

// private async createInitialPositionSnapshot(
//   positionId: string,
//   priceXUSD: Decimal,
//   priceYUSD: Decimal,
//   initialValueUSD: Decimal,
//   tokenXAmount: string,
//   tokenYAmount: string
// ) {
//   await db.insert(positionSnapshots).values({
//     positionId,
//     snapshotTimestamp: new Date(),
//     currentValueUSD: initialValueUSD.toString(),
//     unrealizedPnlUSD: "0",
//     unrealizedPnlPct: "0",
//     tokenXAmount,
//     tokenYAmount,
//     unclaimedFeesUSD: "0",
//     priceXUSD: priceXUSD.toString(),
//     priceYUSD: priceYUSD.toString(),
//   });
// }

// private async handleFeeClaimed(
//   user: User,
//   position: Position,
//   signature: string
// ) {
//   try {
//     const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
//     const parsedTransaction = await connection.getParsedTransaction(
//       signature,
//       {
//         maxSupportedTransactionVersion: 0,
//       }
//     );

//     if (!parsedTransaction) {
//       throw new Error(`Transaction not found or not confirmed: ${signature}`);
//     }

//     const meteoraParsedIxs =
//       await parseMeteoraInstructions(parsedTransaction);
//     if (meteoraParsedIxs.length === 0) {
//       throw new Error("No meteora instruction found");
//     }

//     const claimIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
//     );

//     if (!claimIx) {
//       throw new Error("No meteora instruction found");
//     }

//     const tokenMintX = position.tokenX?.address!;
//     const tokenMintY = position.tokenY?.address!;

//     const prices = await this.tokenPriceService.getPrices([
//       tokenMintX,
//       tokenMintY,
//     ]);

//     if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
//       throw new Error("No token price found");
//     }

//     const priceXUSD = new Decimal(prices[tokenMintX].price);
//     const priceYUSD = new Decimal(prices[tokenMintY].price);

//     const claimedFeeXAmount = new Decimal(
//       claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
//         ?.amount ?? 0
//     );
//     const claimedFeeYAmount = new Decimal(
//       claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
//         ?.amount ?? 0
//     );

//     const [_claimedFeeXSOL, _claimedFeeYSOL] = await Promise.all([
//       // Token A swap
//       (async () => {
//         if (tokenMintX !== SOL_MINT) {
//           try {
//             logger.debug(`[Position] Swapping token ${tokenMintX} to SOL`);
//             const tokenXToSolOrder = await jupiterService.getOrder({
//               inputMint: tokenMintX,
//               outputMint: SOL_MINT,
//               amount: claimedFeeXAmount.toString(),
//               taker: user.walletAddress!,
//             });

//             const swapTxStr = tokenXToSolOrder.transaction;
//             if (!swapTxStr) {
//               throw new Error("Failed to get swap transaction for Token A");
//             }
//             const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//             const { signedTransaction } = await WalletService.signTransaction(
//               user,
//               swapTx
//             );

//             const tokenXToSolExecute = await jupiterService.executeOrder({
//               requestId: tokenXToSolOrder.requestId,
//               signedTransaction: Buffer.from(
//                 signedTransaction.serialize()
//               ).toString("base64"),
//             });

//             if (tokenXToSolExecute.status === "Failed") {
//               throw new Error(
//                 `Failed to convert SOL to token A: ${tokenXToSolExecute.error}`
//               );
//             }

//             logger.info(
//               `[Position] Swapped token ${tokenMintX} to SOL: ${tokenXToSolExecute.signature}`
//             );

//             return new Decimal(tokenXToSolExecute.outputAmountResult || "0");
//           } catch (error) {
//             logger.error("Error converting SOL to token A:", error);
//             throw error;
//           }
//         } else {
//           return new Decimal(claimedFeeXAmount);
//         }
//       })(),
//       // token Y to SOL
//       (async () => {
//         if (tokenMintY !== SOL_MINT) {
//           try {
//             logger.debug(`[Position] Swapping token ${tokenMintY} to SOL`);
//             const tokenYToSolOrder = await jupiterService.getOrder({
//               inputMint: tokenMintY,
//               outputMint: SOL_MINT,
//               amount: claimedFeeYAmount.toString(),
//               taker: user.walletAddress!,
//             });

//             const swapTxStr = tokenYToSolOrder.transaction;
//             if (!swapTxStr) {
//               throw new Error("Failed to get swap transaction for Token Y");
//             }
//             const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//             const { signedTransaction } = await WalletService.signTransaction(
//               user,
//               swapTx
//             );

//             const tokenYToSolExecute = await jupiterService.executeOrder({
//               requestId: tokenYToSolOrder.requestId,
//               signedTransaction: Buffer.from(
//                 signedTransaction.serialize()
//               ).toString("base64"),
//             });

//             if (tokenYToSolExecute.status === "Failed") {
//               throw new Error(
//                 `Failed to convert SOL to token Y: ${tokenYToSolExecute.error}`
//               );
//             }

//             logger.info(
//               `[Position] Swapped token ${tokenMintY} to SOL: ${tokenYToSolExecute.signature}`
//             );

//             return new Decimal(tokenYToSolExecute.outputAmountResult || "0");
//           } catch (error) {
//             logger.error("Error converting SOL to token A:", error);
//             throw error;
//           }
//         } else {
//           return new Decimal(claimedFeeYAmount);
//         }
//       })(),
//     ]);

//     const claimedFeeXValueUSD = new Decimal(claimedFeeXAmount.toString())
//       .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
//       .mul(priceXUSD);

//     const claimedFeeYValueUSD = new Decimal(claimedFeeYAmount.toString())
//       .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
//       .mul(priceYUSD);

//     const totalClaimedFeeUSD = claimedFeeXValueUSD.add(claimedFeeYValueUSD);

//     const currentFeeXAmount = new Decimal(position.feeTokenXAmount || "0");
//     const currentFeeYAmount = new Decimal(position.feeTokenYAmount || "0");

//     const updatedFeeXAmount = currentFeeXAmount.add(
//       claimedFeeXAmount.toString()
//     );
//     const updatedFeeYAmount = currentFeeYAmount.add(
//       claimedFeeYAmount.toString()
//     );

//     const cumulativeAbsolutePnlUSD = new Decimal(
//       position.cumulativeAbsolutePnlUSD ?? "0"
//     ).add(totalClaimedFeeUSD.toString());

//     await updatePosition(position.id, {
//       feeTokenXAmount: updatedFeeXAmount.toString(),
//       feeTokenYAmount: updatedFeeYAmount.toString(),
//       cumulativeAbsolutePnlUSD: cumulativeAbsolutePnlUSD.toString(),
//       // Update fees earned in SOL (approximate conversion)
//       // FIXME
//       feesEarnedInSol: new Decimal(position.feesEarnedInSol || "0")
//         .add(totalClaimedFeeUSD.div(prices[SOL_MINT]?.price || 1))
//         .toString(),
//     });

//     await createClaimHistory({
//       positionId: position.id,
//       timestamp: new Date(),
//       claimedAmountX: claimedFeeXAmount.toString(),
//       claimedAmountY: claimedFeeYAmount.toString(),
//       claimedUSD: totalClaimedFeeUSD.toString(),
//       isDuringRebalance: false,
//       txHash: signature,
//       notes: "Manual fee claim",
//     });

//     await this.createPositionSnapshotAfterFeeClaim(
//       position.id,
//       priceXUSD,
//       priceYUSD,
//       totalClaimedFeeUSD
//     );

//     logger.info(
//       `[Position] Fee claimed successfully for position ${position.id}: ${totalClaimedFeeUSD.toString()} USD`
//     );

//     // Calculate Total Claimed Fees
//     const totalClaimedFees = await getTotalClaimedFees(position.id);

//     const updatedPosition = await getPositionsById(position.id);

//     const cumulativePnL =
//       updatedPosition?.pnlInUsd || updatedPosition?.cumulativeAbsolutePnlUSD;

//     return {
//       claimedFeeXAmount: claimedFeeXAmount.toString(),
//       claimedFeeXValueUSD: claimedFeeXValueUSD.toJSON(),
//       claimedFeeYAmount: claimedFeeYAmount.toString(),
//       claimedFeeYValueUSD: claimedFeeYValueUSD.toJSON(),
//       totalClaimedFeeUSD: totalClaimedFeeUSD.toJSON(),
//       totalClaimedFees,
//       cumulativePnL: cumulativePnL || "0",
//     };
//   } catch (error) {
//     console.error(error);
//     logger.error(
//       `[Position] Error handling position created: ${error}`,
//       error
//     );
//   }
// }

// private async createPositionSnapshotAfterFeeClaim(
//   positionId: string,
//   priceXUSD: Decimal,
//   priceYUSD: Decimal,
//   claimedFeeUSD: Decimal
// ) {
//   const position = await db.query.positions.findFirst({
//     where: eq(positions.id, positionId),
//   });

//   if (!position) {
//     throw new Error("Position not found for snapshot");
//   }

//   const tokenXValueUSD = new Decimal(position.depositTokenXAmount || "0")
//     .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
//     .mul(priceXUSD);

//   const tokenYValueUSD = new Decimal(position.depositTokenYAmount || "0")
//     .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
//     .mul(priceYUSD);

//   const currentValueUSD = tokenXValueUSD.add(tokenYValueUSD);
//   const initialValueUSD = new Decimal(position.initialValueUSD || "0");

//   const unrealizedPnlUSD = currentValueUSD
//     .minus(initialValueUSD)
//     .add(claimedFeeUSD);
//   const unrealizedPnlPct = initialValueUSD.gt(0)
//     ? unrealizedPnlUSD.div(initialValueUSD).mul(100)
//     : new Decimal(0);

//   await db.insert(positionSnapshots).values({
//     positionId,
//     snapshotTimestamp: new Date(),
//     currentValueUSD: currentValueUSD.toString(),
//     unrealizedPnlUSD: unrealizedPnlUSD.toString(),
//     unrealizedPnlPct: unrealizedPnlPct.toString(),
//     tokenXAmount: position.depositTokenXAmount || "0",
//     tokenYAmount: position.depositTokenYAmount || "0",
//     unclaimedFeesUSD: "0", // Fees were just claimed
//     priceXUSD: priceXUSD.toString(),
//     priceYUSD: priceYUSD.toString(),
//   });
// }

// private async handlePositionClosed(
//   user: User,
//   position: Position,
//   signature: string
// ) {
//   try {
//     logger.info(
//       `[Position] Closing position ${signature} for user ${user.id}`
//     );
//     const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
//     const parsedTransaction = await connection.getParsedTransaction(
//       signature,
//       {
//         maxSupportedTransactionVersion: 0,
//       }
//     );

//     if (!parsedTransaction) {
//       throw new Error(`Transaction not found or not confirmed: ${signature}`);
//     }

//     const meteoraParsedIxs =
//       await parseMeteoraInstructions(parsedTransaction);
//     if (meteoraParsedIxs.length === 0) {
//       throw new Error("No meteora instruction found");
//     }

//     const removeIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "remove" &&
//         ix.instructionName === "remove_liquidity_by_range2"
//     );

//     const claimIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
//     );

//     const closeIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "close" &&
//         ix.instructionName === "close_position_if_empty"
//     );

//     console.log("removeIx", removeIx);
//     console.log("claimIx", claimIx);
//     console.log("closeIx", closeIx);

//     if (!removeIx || !claimIx || !closeIx) {
//       throw new Error("No meteora instruction found");
//     }

//     const tokenMintX = position.tokenX?.address!;
//     const tokenMintY = position.tokenY?.address!;

//     const prices = await this.tokenPriceService.getPrices([
//       tokenMintX!,
//       tokenMintY!,
//     ]);

//     if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
//       throw new Error("No token price found");
//     }

//     const priceXUSD = new Decimal(prices[tokenMintX].price);
//     const priceYUSD = new Decimal(prices[tokenMintY].price);

//     const tokenXAmount = new Decimal(
//       removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
//         ?.amount ?? 0
//     );

//     const tokenYAmount = new Decimal(
//       removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
//         ?.amount ?? 0
//     );

//     const claimedFeeXAmount = new Decimal(
//       claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
//         ?.amount ?? 0
//     );

//     const claimedFeeYAmount = new Decimal(
//       claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
//         ?.amount ?? 0
//     );

//     // Calculate USD values
//     const tokenXValueUSD = tokenXAmount
//       .div(new Decimal(10).pow(position.tokenX?.decimals!))
//       .mul(priceXUSD);

//     const tokenYValueUSD = tokenYAmount
//       .div(new Decimal(10).pow(position.tokenY?.decimals!))
//       .mul(priceYUSD);

//     const claimedFeeXValueUSD = claimedFeeXAmount
//       .div(new Decimal(10).pow(position.tokenX?.decimals!))
//       .mul(priceXUSD);

//     const claimedFeeYValueUSD = claimedFeeYAmount
//       .div(new Decimal(10).pow(position.tokenY?.decimals!))
//       .mul(priceYUSD);

//     const totalClaimedFeeUSD = claimedFeeXValueUSD.add(claimedFeeYValueUSD);
//     const finalValueUSD = tokenXValueUSD
//       .add(tokenYValueUSD)
//       .add(totalClaimedFeeUSD);
//     const initialValueUSD = new Decimal(position.initialValueUSD || "0");

//     const pnlInUsd = finalValueUSD.minus(initialValueUSD);
//     const pnlPercentage = initialValueUSD.gt(0)
//       ? pnlInUsd.div(initialValueUSD).mul(100)
//       : new Decimal(0);

//     // swap tokens to SOL
//     const [tokenXInSOL, tokenYInSOL, claimedFeeXInSOL, claimedFeeYInSOL] =
//       await Promise.all([
//         // Token A swap
//         (async () => {
//           if (tokenMintX !== SOL_MINT) {
//             try {
//               logger.debug(`[Position] Swapping token ${tokenMintX} to SOL`);
//               const tokenXToSolOrder = await jupiterService.getOrder({
//                 inputMint: tokenMintX,
//                 outputMint: SOL_MINT,
//                 amount: tokenXAmount.toString(),
//                 taker: user.walletAddress!,
//               });

//               const swapTxStr = tokenXToSolOrder.transaction;
//               if (!swapTxStr) {
//                 throw new Error("Failed to get swap transaction for Token A");
//               }
//               const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//               const { signedTransaction } =
//                 await WalletService.signTransaction(user, swapTx);

//               const tokenXToSolExecute = await jupiterService.executeOrder({
//                 requestId: tokenXToSolOrder.requestId,
//                 signedTransaction: Buffer.from(
//                   signedTransaction.serialize()
//                 ).toString("base64"),
//               });

//               if (tokenXToSolExecute.status === "Failed") {
//                 throw new Error(
//                   `Failed to convert SOL to token A: ${tokenXToSolExecute.error}`
//                 );
//               }

//               logger.info(
//                 `[Position] Swapped token ${tokenMintX} to SOL: ${tokenXToSolExecute.signature}`
//               );

//               return new Decimal(
//                 tokenXToSolExecute.outputAmountResult || "0"
//               );
//             } catch (error) {
//               logger.error("Error converting SOL to token A:", error);
//               throw error;
//             }
//           } else {
//             return new Decimal(tokenXAmount);
//           }
//         })(),
//         // token Y to SOL
//         (async () => {
//           if (tokenMintY !== SOL_MINT) {
//             try {
//               logger.debug(`[Position] Swapping token ${tokenMintY} to SOL`);
//               const tokenYToSolOrder = await jupiterService.getOrder({
//                 inputMint: tokenMintY,
//                 outputMint: SOL_MINT,
//                 amount: tokenYAmount.toString(),
//                 taker: user.walletAddress!,
//               });

//               const swapTxStr = tokenYToSolOrder.transaction;
//               if (!swapTxStr) {
//                 throw new Error("Failed to get swap transaction for Token Y");
//               }
//               const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//               const { signedTransaction } =
//                 await WalletService.signTransaction(user, swapTx);

//               const tokenYToSolExecute = await jupiterService.executeOrder({
//                 requestId: tokenYToSolOrder.requestId,
//                 signedTransaction: Buffer.from(
//                   signedTransaction.serialize()
//                 ).toString("base64"),
//               });

//               if (tokenYToSolExecute.status === "Failed") {
//                 throw new Error(
//                   `Failed to convert SOL to token Y: ${tokenYToSolExecute.error}`
//                 );
//               }

//               logger.info(
//                 `[Position] Swapped token ${tokenMintY} to SOL: ${tokenYToSolExecute.signature}`
//               );

//               return new Decimal(
//                 tokenYToSolExecute.outputAmountResult || "0"
//               );
//             } catch (error) {
//               logger.error("Error converting SOL to token A:", error);
//               throw error;
//             }
//           } else {
//             return new Decimal(tokenYAmount);
//           }
//         })(),
//         // claim fee x to SOL
//         (async () => {
//           if (tokenMintX !== SOL_MINT) {
//             try {
//               logger.debug(`[Position] Swapping fee ${tokenMintX} to SOL`);
//               const claimFeeXToSolOrder = await jupiterService.getOrder({
//                 inputMint: tokenMintX,
//                 outputMint: SOL_MINT,
//                 amount: claimedFeeXAmount.toString(),
//                 taker: user.walletAddress!,
//               });

//               const swapTxStr = claimFeeXToSolOrder.transaction;
//               if (!swapTxStr) {
//                 throw new Error("Failed to get swap transaction for Token A");
//               }
//               const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//               const { signedTransaction } =
//                 await WalletService.signTransaction(user, swapTx);

//               const claimFeeXToSolExecute = await jupiterService.executeOrder(
//                 {
//                   requestId: claimFeeXToSolOrder.requestId,
//                   signedTransaction: Buffer.from(
//                     signedTransaction.serialize()
//                   ).toString("base64"),
//                 }
//               );

//               if (claimFeeXToSolExecute.status === "Failed") {
//                 throw new Error(
//                   `Failed to convert SOL to token A: ${claimFeeXToSolExecute.error}`
//                 );
//               }

//               logger.info(
//                 `[Position] Swapped fee ${tokenMintX} to SOL: ${claimFeeXToSolExecute.signature}`
//               );

//               return new Decimal(
//                 claimFeeXToSolExecute.outputAmountResult || "0"
//               );
//             } catch (error) {
//               logger.error("Error converting SOL to token A:", error);
//               throw error;
//             }
//           } else {
//             return new Decimal(claimedFeeXAmount);
//           }
//         })(),
//         // claim fee y to SOL
//         (async () => {
//           if (tokenMintY !== SOL_MINT) {
//             try {
//               logger.debug(`[Position] Swapping fee ${tokenMintY} to SOL`);
//               const claimFeeYToSolOrder = await jupiterService.getOrder({
//                 inputMint: tokenMintY,
//                 outputMint: SOL_MINT,
//                 amount: claimedFeeYAmount.toString(),
//                 taker: user.walletAddress!,
//               });

//               const swapTxStr = claimFeeYToSolOrder.transaction;
//               if (!swapTxStr) {
//                 throw new Error("Failed to get swap transaction for Token A");
//               }
//               const swapTx = jupiterService.getOrderTransaction(swapTxStr);

//               const { signedTransaction } =
//                 await WalletService.signTransaction(user, swapTx);

//               const claimFeeYToSolExecute = await jupiterService.executeOrder(
//                 {
//                   requestId: claimFeeYToSolOrder.requestId,
//                   signedTransaction: Buffer.from(
//                     signedTransaction.serialize()
//                   ).toString("base64"),
//                 }
//               );

//               if (claimFeeYToSolExecute.status === "Failed") {
//                 throw new Error(
//                   `Failed to convert SOL to token A: ${claimFeeYToSolExecute.error}`
//                 );
//               }

//               logger.info(
//                 `[Position] Swapped fee ${tokenMintY} to SOL: ${claimFeeYToSolExecute.signature}`
//               );

//               return new Decimal(
//                 claimFeeYToSolExecute.outputAmountResult || "0"
//               );
//             } catch (error) {
//               logger.error("Error converting SOL to token A:", error);
//               throw error;
//             }
//           } else {
//             return new Decimal(claimedFeeYAmount);
//           }
//         })(),
//       ]);

//     const feesEarnedInSol = claimedFeeXInSOL.add(claimedFeeYInSOL);
//     const finalValueInSOL = tokenXInSOL
//       .add(tokenYInSOL)
//       .add(claimedFeeXInSOL)
//       .add(claimedFeeYInSOL);
//     const initialValueSOL = new Decimal(position.initialValueSOL || "0");
//     const pnlInSol = finalValueInSOL.minus(initialValueSOL);

//     // Update cumulative PnL
//     const currentCumulativePnl = new Decimal(
//       position.cumulativeAbsolutePnlUSD || "0"
//     );
//     const updatedCumulativePnl = currentCumulativePnl.add(pnlInUsd.abs());

//     await updatePosition(position.id, {
//       status: "CLOSED",
//       closureSignature: signature,

//       withdrawTokenXAmount: tokenXAmount.toString(),
//       withdrawTokenYAmount: tokenYAmount.toString(),
//       tokenXPriceAtClosure: priceXUSD.toString(),
//       tokenYPriceAtClosure: priceYUSD.toString(),
//       feeTokenXAmount: claimedFeeXAmount.toString(),
//       feeTokenYAmount: claimedFeeYAmount.toString(),

//       finalValueUSD: finalValueUSD.toString(),
//       finalValueSol: finalValueInSOL.toString(),
//       feesEarnedInSol: feesEarnedInSol.toString(),
//       pnlInUsd: pnlInUsd.toString(),
//       pnlInSol: pnlInSol.toString(),
//       pnlPercentage: pnlPercentage.toString(),
//       cumulativeAbsolutePnlUSD: updatedCumulativePnl.toString(),
//     });

//     await this.createFinalPositionSnapshot(
//       position.id,
//       priceXUSD,
//       priceYUSD,
//       finalValueUSD,
//       pnlInUsd,
//       pnlPercentage,
//       tokenXAmount.toString(),
//       tokenYAmount.toString(),
//       totalClaimedFeeUSD
//     );
//   } catch (error) {
//     console.error(error);
//     logger.error(
//       `[Position] Error handling position created: ${error}`,
//       error
//     );
//   }
// }

// private async createFinalPositionSnapshot(
//   positionId: string,
//   priceXUSD: Decimal,
//   priceYUSD: Decimal,
//   finalValueUSD: Decimal,
//   pnlInUsd: Decimal,
//   pnlPercentage: Decimal,
//   tokenXAmount: string,
//   tokenYAmount: string,
//   claimedFeeUSD: Decimal
// ) {
//   await db.insert(positionSnapshots).values({
//     positionId,
//     snapshotTimestamp: new Date(),
//     currentValueUSD: finalValueUSD.toString(),
//     unrealizedPnlUSD: pnlInUsd.toString(), // Now realized
//     unrealizedPnlPct: pnlPercentage.toString(),
//     tokenXAmount,
//     tokenYAmount,
//     unclaimedFeesUSD: "0", // All fees claimed during closure
//     priceXUSD: priceXUSD.toString(),
//     priceYUSD: priceYUSD.toString(),
//   });
// }

// async checkClaimFeeTx(signature: string) {
//   const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
//   // FIXME: add retry logic
//   const parsedTransaction = await connection.getParsedTransaction(signature, {
//     maxSupportedTransactionVersion: 0,
//   });

//   if (!parsedTransaction) {
//     throw new Error(`Transaction not found or not confirmed: ${signature}`);
//   }

//   const meteoraParsedIxs = await parseMeteoraInstructions(parsedTransaction);
//   if (meteoraParsedIxs.length === 0) {
//     throw new Error("No meteora instruction found");
//   }

//   console.log("meteoraParsedIxs", meteoraParsedIxs);

//   const claimIx = meteoraParsedIxs.find(
//     (ix) =>
//       ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
//   );

//   if (!claimIx) {
//     throw new Error("No meteora instruction found");
//   }

//   console.dir(claimIx);
// }
