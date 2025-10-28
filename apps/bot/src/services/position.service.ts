/**
 * PositionService - DEX-Agnostic Position Management
 * 
 * This service provides business logic for managing liquidity positions across multiple DEXes.
 * It coordinates between the DexRegistry, database operations, and blockchain interactions.
 * 
 * All DEX-specific operations are delegated to adapters via DexRegistry.
 * This service focuses on orchestration, validation, and database persistence.
 */

import { dexRegistry } from "@/services/dex-registry.service";
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
import { OPEN_POSITION_FEE } from "@/config/constants";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
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
import { DexType } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";

export interface PositionCreationParams {
  user: User;
  poolAddress: string;
  dex: DexType;
  strategyType: "SPOT" | "CURVE" | "BID_ASK";
  enteredAmount: number;
  autoRebalancing: boolean;
  binRange?: number;
}

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
  private tokenPriceService: TokenPriceService;
  private tokenAdapter: TokenAdapter;

  constructor() {
    this.jupiterService = new JupiterService();
    this.tokenPriceService = new TokenPriceService();
    this.tokenAdapter = new TokenAdapter();
  }

  // ============================================================================
  // PUBLIC API - DEX-Agnostic Position Management
  // ============================================================================

  /**
   * Create a balanced liquidity position on any DEX
   * 
   * This method is DEX-agnostic and routes the position creation through
   * the appropriate adapter based on the dex parameter.
   * 
   * @param params - Position creation parameters including DEX identifier
   * @returns Result with position ID and transaction signature
   */
  async createBalancedPosition(
    params: PositionCreationParams
  ): Promise<PositionCreationResult> {
    try {
      const { user, poolAddress, dex, strategyType, enteredAmount, autoRebalancing, binRange } = params;

      logger.info(
        `[Position] Creating ${strategyType} position on ${dex} for user ${user.id}`
      );

      // Get the appropriate DEX adapter
      const adapter = dexRegistry.get(dex);

      // Calculate fee and net amount
      const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
      const amount = enteredAmount - feeAmount;

      // Get pool information from adapter
      const poolInfo = await adapter.getPool(poolAddress);
      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      // Calculate amounts for balanced position
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

      // Create position using adapter
      const createResult = await adapter.createPositionIx({
        poolAddress,
        userAddress: user.walletAddress!,
        tokenAAmount: tokenAAmount.toString(),
        tokenBAmount: tokenBAmount.toString(),
        strategy: strategyType,
        rangeInterval: binRange || user.balancedPositionBinRange,
      });

      if (!createResult.success || !createResult.instructions) {
        throw new Error(createResult.error || "Failed to build position transaction");
      }

      // Sign and send transaction
      const positionSigner = createResult.positionKp;
      const signature = await WalletService.signAndSendTransaction(
        user,
        createResult.instructions,
        positionSigner ? [positionSigner] : []
      );

      const positionAddress = positionSigner
        ? positionSigner.publicKey.toString()
        : undefined;

      // Queue background processing for database operations
      await this.handlePositionCreated(
        user,
        dex,
        poolAddress,
        amount,
        autoRebalancing,
        signature,
        positionAddress || poolAddress
      );

      return {
        success: true,
        transactionId: signature,
        positionId: positionAddress,
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
   * Claim fees from a position (DEX-agnostic)
   */
  async claimFees(
    user: User,
    positionId: string
  ): Promise<ClaimFeeResult> {
    try {
      logger.info(
        `[Position] Claiming fees for position ${positionId} for user ${user.id}`
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

      // Get adapter for this position's DEX
      const adapter = dexRegistry.get(position.dex as DexType);

      // Build claim fees transaction using adapter
      const claimResult = await adapter.claimFeesIx({
        userAddress: user.walletAddress,
        poolAddress: position.poolAddress,
        positionAddress: position.positionAddress,
      });

      if (!claimResult.success || !claimResult.instructions) {
        throw new Error(claimResult.error || "Failed to build claim fees transaction");
      }

      // Sign and send transaction
      const transactionId = await WalletService.signAndSendTransaction(
        user,
        claimResult.instructions,
        []
      );

      // Process fee claim asynchronously
      const result = await this.handleFeeClaimed(
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
      logger.error(`[Position] Error claiming fees:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to claim fees",
      };
    }
  }

  /**
   * Close a position and return all liquidity (DEX-agnostic)
   */
  async closePosition(
    user: User,
    positionId: string
  ): Promise<PositionCloseResult> {
    try {
      logger.info(
        `[Position] Closing position ${positionId} for user ${user.id}`
      );

      const position = await getPositionsById(positionId);
      if (!position) {
        throw new Error("Position not found");
      }

      if (position.status !== "ACTIVE") {
        throw new Error("Position is not active");
      }

      // Get adapter for this position's DEX
      const adapter = dexRegistry.get(position.dex as DexType);

      // Build close position transaction using adapter
      const closeResult = await adapter.closePositionIx({
        userAddress: user.walletAddress,
        poolAddress: position.poolAddress,
        positionAddress: position.positionAddress,
      });

      if (!closeResult.success || !closeResult.instructions) {
        throw new Error(closeResult.error || "Failed to build close position transaction");
      }

      // Sign and send transaction
      const transactionId = await WalletService.signAndSendTransaction(
        user,
        closeResult.instructions,
        []
      );

      // Process position close asynchronously
      await this.handlePositionClosed(
        user,
        position,
        transactionId
      );

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      logger.error(`[Position] Error closing position:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  /**
   * Rebalance a position to a new range (DEX-agnostic)
   */
  async rebalancePosition(
    user: User,
    positionId: string,
    newBinRange?: number
  ): Promise<RebalanceResult> {
    try {
      logger.info(
        `[Position] Rebalancing position ${positionId} for user ${user.id}`
      );

      const position = await getPositionsById(positionId);
      if (!position) {
        throw new Error("Position not found");
      }

      if (position.status !== "ACTIVE") {
        throw new Error("Position is not active");
      }

      // Get adapter for this position's DEX
      const adapter = dexRegistry.get(position.dex as DexType);

      // Step 1: Close old position and claim fees
      const closeResult = await this.closePosition(user, positionId);
      if (!closeResult.success) {
        throw new Error(closeResult.error || "Failed to close position");
      }

      // Step 2: Get current balances to create new position
      // (This would need wallet balance checking logic)

      // Step 3: Create new position at current price
      // (This would use the adapter to create a new position)

      // For now, return placeholder
      logger.info(`[Position] Rebalancing logic to be fully implemented`);

      return {
        success: true,
        transactionId: closeResult.transactionId,
      };
    } catch (error) {
      logger.error(`[Position] Error rebalancing position:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to rebalance position",
      };
    }
  }

  /**
   * Get position details with current blockchain state (DEX-agnostic)
   */
  async getPosition(positionId: string): Promise<Position | null> {
    try {
      const position = await getPositionsById(positionId);
      if (!position) {
        return null;
      }

      // Optionally enrich with current blockchain data
      // const adapter = dexRegistry.get(position.dex as DexType);
      // const currentData = await adapter.getPosition(position.positionAddress, {
      //   poolAddress: position.poolAddress,
      //   userAddress: ...
      // });

      return position;
    } catch (error) {
      logger.error(`[Position] Error fetching position ${positionId}:`, error);
      return null;
    }
  }

  /**
   * Calculate position P&L (DEX-agnostic)
   */
  async calculatePositionPnL(
    position: Position
  ): Promise<PositionPnlResult> {
    try {
      // Get current prices
      const prices = await this.tokenPriceService.getPrices([
        position.tokenX?.address || "",
        position.tokenY?.address || "",
        SOL_MINT,
      ]);

      if (!prices) {
        throw new Error("Failed to fetch token prices");
      }

      const tokenXPrice = new Decimal(prices[position.tokenX?.address || ""]?.price || 0);
      const tokenYPrice = new Decimal(prices[position.tokenY?.address || ""]?.price || 0);
      const solPrice = new Decimal(prices[SOL_MINT]?.price || 0);

      // Calculate current value
      const currentTokenXValue = new Decimal(position.currentTokenXAmount || "0")
        .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
        .mul(tokenXPrice);

      const currentTokenYValue = new Decimal(position.currentTokenYAmount || "0")
        .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
        .mul(tokenYPrice);

      const currentValueUSD = currentTokenXValue.add(currentTokenYValue);

      // Calculate P&L
      const initialValueUSD = new Decimal(position.initialValueUSD || "0");
      const totalFeesClaimedUSD = new Decimal(position.totalFeesClaimedUSD || "0");
      
      const unrealizedPnlUSD = currentValueUSD.minus(initialValueUSD);
      const totalPnlUSD = unrealizedPnlUSD.add(totalFeesClaimedUSD);
      const pnlPercentage = initialValueUSD.gt(0)
        ? totalPnlUSD.div(initialValueUSD).mul(100)
        : new Decimal(0);

      return {
        currentValueUSD: currentValueUSD.toString(),
        unrealizedPnlUSD: unrealizedPnlUSD.toString(),
        realizedPnlUSD: totalFeesClaimedUSD.toString(),
        totalPnlUSD: totalPnlUSD.toString(),
        pnlPercentage: pnlPercentage.toString(),
        tokenXPrice: tokenXPrice.toString(),
        tokenYPrice: tokenYPrice.toString(),
        solPrice: solPrice.toString(),
      };
    } catch (error) {
      logger.error(`[Position] Error calculating P&L:`, error);
      throw error;
    }
  }

  // ============================================================================
  // INTERNAL HELPERS - DEX-Agnostic Business Logic
  // ============================================================================

  /**
   * Handle position creation confirmation and database persistence
   */
  private async handlePositionCreated(
    user: User,
    dex: DexType,
    poolAddress: string,
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

      // Parse transaction instructions (DEX-specific, but handles multiple DEXes)
      const parsedIxs = await parseMeteoraInstructions(parsedTransaction);
      if (parsedIxs.length === 0) {
        throw new Error("No position creation instruction found");
      }

      const openIx = parsedIxs.find(
        (ix) =>
          ix.instructionType === "open" &&
          ix.instructionName === "initialize_position"
      );

      const addIx = parsedIxs.find(
        (ix) =>
          ix.instructionType === "add" &&
          ix.instructionName === "add_liquidity_by_strategy2"
      );

      if (!openIx || !addIx) {
        throw new Error("Position creation instructions not found");
      }

      const mintX = addIx.accounts.tokenXMint;
      const mintY = addIx.accounts.tokenYMint;

      if (!mintX || !mintY) {
        throw new Error("Token mints not found in transaction");
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
        throw new Error("Token prices not found");
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
        throw new Error("Token amounts not found in transaction");
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
        dex,
        strategyType: "DLMM", // TODO: Map from actual strategy
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
   * Handle fee claim confirmation and database update
   */
  private async handleFeeClaimed(
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

      const parsedIxs = await parseMeteoraInstructions(parsedTransaction);
      if (parsedIxs.length === 0) {
        throw new Error("No claim instruction found");
      }

      const claimIx = parsedIxs.find(
        (ix) =>
          ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
      );

      if (!claimIx) {
        throw new Error("Claim fee instruction not found");
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
              logger.error(`Error swapping Token X to SOL:`, error);
              return new BN(0);
            }
          }
          return new BN(claimedTokenXAmount.toString());
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
              logger.error(`Error swapping Token Y to SOL:`, error);
              return new BN(0);
            }
          }
          return new BN(claimedTokenYAmount.toString());
        })(),
      ]);

      totalSolReceived = new Decimal(solFromTokenX.add(solFromTokenY).toString())
        .div(new Decimal(10).pow(9));

      // Update database records
      const previousTotalFees = new Decimal(position.totalFeesClaimedUSD || "0");
      const newTotalFees = previousTotalFees.add(totalClaimedUSD);

      await updatePosition(position.id, {
        totalFeesClaimedUSD: newTotalFees.toString(),
        lastClaimAt: new Date(),
        updatedAt: new Date(),
      });

      // Record claim history
      await createClaimHistory({
        positionId: position.id,
        segmentId: currentSegment.id,
        claimSignature: signature,
        claimedTokenXAmount: claimedTokenXAmount.toString(),
        claimedTokenYAmount: claimedTokenYAmount.toString(),
        claimedTokenXValueUSD: claimedTokenXValueUSD.toString(),
        claimedTokenYValueUSD: claimedTokenYValueUSD.toString(),
        totalClaimedUSD: totalClaimedUSD.toString(),
        tokenXPriceUSD: priceXUSD.toString(),
        tokenYPriceUSD: priceYUSD.toString(),
      });

      logger.info(
        `[Position] Fees claimed successfully for position ${position.id}: $${totalClaimedUSD.toString()}`
      );

      return {
        claimedFeeXAmount: claimedTokenXAmount.toString(),
        claimedFeeXValueUSD: claimedTokenXValueUSD.toString(),
        claimedFeeYAmount: claimedTokenYAmount.toString(),
        claimedFeeYValueUSD: claimedTokenYValueUSD.toString(),
        totalClaimedFeeUSD: totalClaimedUSD.toString(),
        totalClaimedFees: newTotalFees.toString(),
      };
    } catch (error) {
      logger.error(
        `[Position] Error handling fee claimed:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handle position close confirmation and database update
   */
  private async handlePositionClosed(
    user: User,
    position: Position,
    signature: string
  ) {
    try {
      // Update position status
      await updatePosition(position.id, {
        status: "CLOSED",
        closureSignature: signature,
        closedAt: new Date(),
        updatedAt: new Date(),
      });

      logger.info(
        `[Position] Position closed successfully: ${position.id}`
      );
    } catch (error) {
      logger.error(
        `[Position] Error handling position closed:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create a position snapshot for historical tracking
   */
  async createPositionSnapshot(data: {
    positionId: string;
    segmentId: string;
    snapshotType: "creation" | "hourly" | "rebalance" | "closure";
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
    try {
      await db.insert(positionSnapshots).values({
        positionId: data.positionId,
        segmentId: data.segmentId,
        snapshotType: data.snapshotType,
        snapshotTimestamp: new Date(),
        currentValueUSD: data.currentValueUSD,
        currentTokenXAmount: data.tokenXAmount,
        currentTokenYAmount: data.tokenYAmount,
        unclaimedFeesX: data.unclaimedFeesX,
        unclaimedFeesY: data.unclaimedFeesY,
        unclaimedFeesUSD: data.unclaimedFeesUSD,
        unrealizedPnlUSD: data.unrealizedPnlUSD,
        unrealizedPnlPercentage: data.unrealizedPnlPercentage,
        totalPnlUSD: data.totalPnlUSD,
        totalPnlPercentage: data.totalPnlPercentage,
        tokenXPriceUSD: data.tokenXPriceUSD,
        tokenYPriceUSD: data.tokenYPriceUSD,
        solPriceUSD: data.solPriceUSD,
      });

      logger.debug(
        `[Position] Snapshot created for position ${data.positionId}`
      );
    } catch (error) {
      logger.error(
        `[Position] Error creating snapshot:`,
        error
      );
      throw error;
    }
  }

  // ============================================================================
  // SWAP HELPERS - Token Conversion Logic
  // ============================================================================

  /**
   * Swap SOL to a specific token using Jupiter
   */
  private async swapSolToToken(
    user: User,
    tokenAddress: string,
    amountLamports: string
  ): Promise<BN> {
    // If target is SOL, no swap needed
    if (tokenAddress === SOL_MINT) {
      return new BN(amountLamports);
    }

    try {
      // Get quote from Jupiter
      const quote = await this.jupiterService.getQuote({
        inputMint: SOL_MINT,
        outputMint: tokenAddress,
        amount: amountLamports,
        slippageBps: 50, // 0.5% slippage
      });

      if (!quote) {
        throw new Error("Failed to get Jupiter quote");
      }

      // Swap via Jupiter
      const swapResult = await this.jupiterService.swap({
        userPublicKey: new PublicKey(user.walletAddress!),
        quoteResponse: quote,
      });

      logger.debug(
        `[Position] Swapped ${amountLamports} lamports SOL to ${swapResult.outputAmount} ${tokenAddress}`
      );

      return new BN(swapResult.outputAmount);
    } catch (error) {
      logger.error(`[Position] Error swapping SOL to token:`, error);
      throw error;
    }
  }

  /**
   * Swap a token back to SOL using Jupiter
   */
  private async swapTokenToSol(
    user: User,
    tokenAddress: string,
    amount: string
  ): Promise<BN> {
    // If source is already SOL, no swap needed
    if (tokenAddress === SOL_MINT) {
      return new BN(amount);
    }

    try {
      // Get quote from Jupiter
      const quote = await this.jupiterService.getQuote({
        inputMint: tokenAddress,
        outputMint: SOL_MINT,
        amount,
        slippageBps: 50, // 0.5% slippage
      });

      if (!quote) {
        throw new Error("Failed to get Jupiter quote");
      }

      // Swap via Jupiter
      const swapResult = await this.jupiterService.swap({
        userPublicKey: new PublicKey(user.walletAddress!),
        quoteResponse: quote,
      });

      logger.debug(
        `[Position] Swapped ${amount} ${tokenAddress} to ${swapResult.outputAmount} lamports SOL`
      );

      return new BN(swapResult.outputAmount);
    } catch (error) {
      logger.error(`[Position] Error swapping token to SOL:`, error);
      throw error;
    }
  }
}

export const positionService = new PositionService();
