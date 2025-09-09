import { meteoraDlmmService } from "./meteora/dlmm.service";
import { JupiterService, jupiterService } from "./jupiter.service";
import BN from "bn.js";
import { WalletService } from "./wallet.service";
import { db, Position, positions, positionSnapshots, User } from "@/db";
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
  updatePosition,
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

  async createBalancedPosition(
    user: User,
    poolAddress: string,
    depositType: MeteoraCreatePositionStrategy,
    enteredAmount: number
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
    positionId?: string;
  }> {
    try {
      logger.info(
        `[Position] Creating ${depositType} position for user ${user.id}`
      );

      const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
      const amount = enteredAmount - feeAmount;

      const poolInfo = await poolService.getPoolV2(poolAddress);
      if (!poolInfo) {
        throw new Error("Pool not found");
      }

      const { strategy, dbStrategyType } = this.getMeteoraStrategy(depositType);

      const halfAmount = amount / 2;
      const halfAmountLamports = (halfAmount * 1e9).toString();

      logger.debug(`[Position] Starting SOL to Token A & B conversions...`);

      const [tokenAAmount, tokenBAmount] = await Promise.all([
        // Token A swap
        (async () => {
          if (poolInfo.tokenA.address !== SOL_MINT) {
            try {
              logger.debug(`[Position] Starting SOL to Token A conversion...`);
              const orderA = await jupiterService.getOrder({
                inputMint: SOL_MINT,
                outputMint: poolInfo.tokenA.address,
                amount: halfAmountLamports,
                taker: user.walletAddress!,
              });

              const swapTxStr = orderA.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token A");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const executeA = await jupiterService.executeOrder({
                requestId: orderA.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (executeA.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token A: ${executeA.error}`
                );
              }

              return new BN(executeA.outputAmountResult || "0");
            } catch (error) {
              logger.error("Error converting SOL to token A:", error);
              throw error;
            }
          } else {
            return new BN(halfAmountLamports);
          }
        })(),

        // Token B swap
        (async () => {
          if (poolInfo.tokenB.address !== SOL_MINT) {
            try {
              logger.debug(`[Position] Starting SOL to Token B conversion...`);
              const orderB = await jupiterService.getOrder({
                inputMint: SOL_MINT,
                outputMint: poolInfo.tokenB.address,
                amount: halfAmountLamports,
                taker: user.walletAddress!,
              });

              const swapTxStr = orderB.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token B");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const executeB = await jupiterService.executeOrder({
                requestId: orderB.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (executeB.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token B: ${executeB.error}`
                );
              }

              return new BN(executeB.outputAmountResult || "0");
            } catch (error) {
              logger.error("Error converting SOL to token B:", error);
              throw error;
            }
          } else {
            return new BN(halfAmountLamports);
          }
        })(),
      ]);

      if (tokenAAmount.isZero() || tokenBAmount.isZero()) {
        throw new Error("Failed to convert SOL to token A or token B");
      }

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

      this.handlePositionCreated(user, amount, signature);

      return {
        success: true,
        transactionId: signature,
      };
    } catch (error) {
      console.error(`[Position] Error creating position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create position",
      };
    }
  }

  async closePosition(
    user: User,
    poolAddress: string,
    positionAddress: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      logger.info(
        `[Position] Closing position ${positionAddress} for user ${user.id}`
      );

      const position = await db.query.positions.findFirst({
        where: eq(positions.positionAddress, positionAddress),
      });

      if (!position) {
        throw new Error("Position not found");
      }

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

      await this.handlePositionClosed(user, position, transactionId);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  async claimFee(
    user: User,
    positionId: string
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      logger.info(
        `[Position] Claiming fee for position ${positionId} for user ${user.id}`
      );

      const position = await db.query.positions.findFirst({
        where: eq(positions.id, positionId),
      });

      if (!position) {
        throw new Error("Position not found");
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

      console.log("transactionId", transactionId);

      await this.handleFeeClaimed(user, position, transactionId);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to claim fee",
      };
    }
  }

  // FIXME
  async getPosition(positionAddress: string) {
    try {
      const position =
        await meteoraPositionService.getDlmmPosition(positionAddress);
      // const poolInfo = await poolService.getPoolV2(position.pair_address);

      const { lbPosition, lbPair } = await meteoraDlmmService.getPosition(
        positionAddress,
        position.pair_address
      );

      return { lbPosition, lbPair };
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      throw error;
    }
  }

  async getLbPositionAndLbPair(poolAddress: string, positionAddress: string) {
    try {
      const { lbPosition, lbPair } = await meteoraDlmmService.getPosition(
        positionAddress,
        poolAddress
      );

      return { lbPosition, lbPair };
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      throw error;
    }
  }

  calculatePositionPnl(
    position: Position,
    lbPosition?: LbPosition,
    priceX?: TokenPrice,
    priceY?: TokenPrice
  ): PositionPnlResult {
    const initialValueUsd = new Decimal(position.initialValueUSD || "0");
    const cumulativeAbsolutePnlUsd = new Decimal(
      position.cumulativeAbsolutePnlUSD || "0"
    );
    const currentSegmentInitialUsd = new Decimal(
      position.currentSegmentInitialUSD || initialValueUsd.toString()
    );

    // For closed positions, use final values
    if (position.status === "CLOSED") {
      const finalValueUsd = new Decimal(position.finalValueUSD || "0");
      const realizedPnlUsd = cumulativeAbsolutePnlUsd.toNumber();
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
      unrealizedPnlUsd = cumulativeAbsolutePnlUsd.plus(segmentUnrealizedUsd);
      unrealizedPnlPercentage = unrealizedPnlUsd
        .div(initialValueUsd)
        .minus(1)
        .times(100);
    } else {
      // Without rebalancing: Simple calculation
      const positionUnrealizedUsd = currentValueUsd.minus(initialValueUsd);
      unrealizedPnlUsd = positionUnrealizedUsd.plus(cumulativeAbsolutePnlUsd);
      unrealizedPnlPercentage = currentValueUsd
        .plus(cumulativeAbsolutePnlUsd)
        .div(initialValueUsd)
        .minus(1)
        .times(100);
    }

    return {
      pnlUsd: unrealizedPnlUsd.toNumber(),
      pnlPercentage: unrealizedPnlPercentage.toNumber(),
      unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
      unrealizedPnlPercentage: unrealizedPnlPercentage.toNumber(),
    };
  }

  // helper
  private getMeteoraStrategy(inputStrategy: any): {
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
      case "single-sided":
        strategy = StrategyType.BidAsk;
        dbStrategyType = "DLMM";
        break;
      default:
        strategy = StrategyType.Spot;
        dbStrategyType = "DLMM";
    }

    return { strategy, dbStrategyType };
  }

  private async handlePositionCreated(
    user: User,
    amount: number,
    signature: string
  ) {
    try {
      const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
      // FIXME: add retry logic
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

      const positionAddress = openIx.accounts.position;
      const poolAddress = openIx.accounts.lbPair;
      const mintX = addIx.accounts.tokenXMint;
      const mintY = addIx.accounts.tokenYMint;

      if (!mintX || !mintY) {
        throw new Error("No token mint found");
      }

      const { tokenX: jupiterTokenX, tokenY: jupiterTokenY } =
        await this.jupiterService.getTokenPairInfo(mintX, mintY);

      const tokenX = this.tokenAdapter.transformToken(jupiterTokenX);
      const tokenY = this.tokenAdapter.transformToken(jupiterTokenY);

      const prices = await this.tokenPriceService.getPrices([
        tokenX.address,
        tokenY.address,
      ]);

      if (!prices || !prices[tokenX.address] || !prices[tokenY.address]) {
        throw new Error("No token price found");
      }

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

      const tokenXValueUSD = new Decimal(amountX)
        .div(new Decimal(10).pow(tokenX.decimals))
        .mul(priceXUSD);

      const tokenYValueUSD = new Decimal(amountY)
        .div(new Decimal(10).pow(tokenY.decimals))
        .mul(priceYUSD);

      const initialValueUSD = tokenXValueUSD.add(tokenYValueUSD);
      const initialValueSOL = new Decimal(amount)
        .mul(new Decimal(10).pow(9))
        .toString();

      const newPos = await createPosition({
        userId: user.id,
        positionAddress,
        poolAddress,
        tokenX,
        tokenY,
        strategyType: "DLMM",
        status: "ACTIVE",
        creationSignature: signature,

        // pnl tracking
        initialValueUSD: initialValueUSD.toString(),
        initialValueSOL: initialValueSOL.toString(),
        cumulativeAbsolutePnlUSD: "0",
        currentSegmentInitialUSD: initialValueUSD.toString(),

        // Rebalancing
        isRebalancingEnabled: true,

        depositTokenXAmount: amountX.toString(),
        depositTokenYAmount: amountY.toString(),
        tokenXPriceAtCreation: priceXUSD.toString(),
        tokenYPriceAtCreation: priceYUSD.toString(),

        withdrawTokenXAmount: "0",
        withdrawTokenYAmount: "0",
        tokenXPriceAtClosure: "0",
        tokenYPriceAtClosure: "0",

        feeTokenXAmount: "0",
        feeTokenYAmount: "0",

        finalValueSol: "0",
        finalValueUSD: "0",
        feesEarnedInSol: "0",
        pnlInSol: "0",
        pnlInUsd: "0",
        pnlPercentage: "0",
      });

      console.log("new Position", newPos);

      if (newPos) {
        await this.createInitialPositionSnapshot(
          newPos.id,
          priceXUSD,
          priceYUSD,
          initialValueUSD,
          amountX.toString(),
          amountY.toString()
        );

        // this.queuePositionMonitorJob({
        //   positionId: newPos.id,
        //   userId,
        // });
      }
    } catch (error) {
      console.error(error);
      logger.error(
        `[Position] Error handling position created: ${error}`,
        error
      );
    }
  }

  private async createInitialPositionSnapshot(
    positionId: string,
    priceXUSD: Decimal,
    priceYUSD: Decimal,
    initialValueUSD: Decimal,
    tokenXAmount: string,
    tokenYAmount: string
  ) {
    await db.insert(positionSnapshots).values({
      positionId,
      snapshotTimestamp: new Date(),
      currentValueUSD: initialValueUSD.toString(),
      unrealizedPnlUSD: "0",
      unrealizedPnlPct: "0",
      tokenXAmount,
      tokenYAmount,
      unclaimedFeesUSD: "0",
      priceXUSD: priceXUSD.toString(),
      priceYUSD: priceYUSD.toString(),
    });
  }

  private async handleFeeClaimed(
    user: User,
    position: Position,
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
        throw new Error("No meteora instruction found");
      }

      const tokenMintX = position.tokenX?.address!;
      const tokenMintY = position.tokenY?.address!;

      const prices = await this.tokenPriceService.getPrices([
        tokenMintX,
        tokenMintY,
      ]);

      if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
        throw new Error("No token price found");
      }

      const priceXUSD = new Decimal(prices[tokenMintX].price);
      const priceYUSD = new Decimal(prices[tokenMintY].price);

      const claimedFeeXAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );
      const claimedFeeYAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      const [claimedFeeXSOL, claimedFeeYSOL] = await Promise.all([
        // Token A swap
        (async () => {
          if (tokenMintX !== SOL_MINT) {
            try {
              logger.debug(`[Position] Swapping token ${tokenMintX} to SOL`);
              const tokenXToSolOrder = await jupiterService.getOrder({
                inputMint: tokenMintX,
                outputMint: SOL_MINT,
                amount: claimedFeeXAmount.toString(),
                taker: user.walletAddress!,
              });

              const swapTxStr = tokenXToSolOrder.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token A");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const tokenXToSolExecute = await jupiterService.executeOrder({
                requestId: tokenXToSolOrder.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (tokenXToSolExecute.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token A: ${tokenXToSolExecute.error}`
                );
              }

              logger.info(
                `[Position] Swapped token ${tokenMintX} to SOL: ${tokenXToSolExecute.signature}`
              );

              return new Decimal(tokenXToSolExecute.outputAmountResult || "0");
            } catch (error) {
              logger.error("Error converting SOL to token A:", error);
              throw error;
            }
          } else {
            return new Decimal(claimedFeeXAmount);
          }
        })(),
        // token Y to SOL
        (async () => {
          if (tokenMintY !== SOL_MINT) {
            try {
              logger.debug(`[Position] Swapping token ${tokenMintY} to SOL`);
              const tokenYToSolOrder = await jupiterService.getOrder({
                inputMint: tokenMintY,
                outputMint: SOL_MINT,
                amount: claimedFeeYAmount.toString(),
                taker: user.walletAddress!,
              });

              const swapTxStr = tokenYToSolOrder.transaction;
              if (!swapTxStr) {
                throw new Error("Failed to get swap transaction for Token Y");
              }
              const swapTx = jupiterService.getOrderTransaction(swapTxStr);

              const { signedTransaction } = await WalletService.signTransaction(
                user,
                swapTx
              );

              const tokenYToSolExecute = await jupiterService.executeOrder({
                requestId: tokenYToSolOrder.requestId,
                signedTransaction: Buffer.from(
                  signedTransaction.serialize()
                ).toString("base64"),
              });

              if (tokenYToSolExecute.status === "Failed") {
                throw new Error(
                  `Failed to convert SOL to token Y: ${tokenYToSolExecute.error}`
                );
              }

              logger.info(
                `[Position] Swapped token ${tokenMintY} to SOL: ${tokenYToSolExecute.signature}`
              );

              return new Decimal(tokenYToSolExecute.outputAmountResult || "0");
            } catch (error) {
              logger.error("Error converting SOL to token A:", error);
              throw error;
            }
          } else {
            return new Decimal(claimedFeeYAmount);
          }
        })(),
      ]);

      const claimedFeeXValueUSD = new Decimal(claimedFeeXAmount.toString())
        .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
        .mul(priceXUSD);

      const claimedFeeYValueUSD = new Decimal(claimedFeeYAmount.toString())
        .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
        .mul(priceYUSD);

      const totalClaimedFeeUSD = claimedFeeXValueUSD.add(claimedFeeYValueUSD);

      const currentFeeXAmount = new Decimal(position.feeTokenXAmount || "0");
      const currentFeeYAmount = new Decimal(position.feeTokenYAmount || "0");

      const updatedFeeXAmount = currentFeeXAmount.add(
        claimedFeeXAmount.toString()
      );
      const updatedFeeYAmount = currentFeeYAmount.add(
        claimedFeeYAmount.toString()
      );

      const cumulativeAbsolutePnlUSD = new Decimal(
        position.cumulativeAbsolutePnlUSD ?? "0"
      ).add(totalClaimedFeeUSD.toString());

      await updatePosition(position.id, {
        feeTokenXAmount: updatedFeeXAmount.toString(),
        feeTokenYAmount: updatedFeeYAmount.toString(),
        cumulativeAbsolutePnlUSD: cumulativeAbsolutePnlUSD.toString(),
        // Update fees earned in SOL (approximate conversion)
        // FIXME
        feesEarnedInSol: new Decimal(position.feesEarnedInSol || "0")
          .add(totalClaimedFeeUSD.div(prices[SOL_MINT]?.price || 1))
          .toString(),
      });

      await createClaimHistory({
        positionId: position.id,
        timestamp: new Date(),
        claimedAmountX: claimedFeeXAmount.toString(),
        claimedAmountY: claimedFeeYAmount.toString(),
        claimedUSD: totalClaimedFeeUSD.toString(),
        isDuringRebalance: false,
        txHash: signature,
        notes: "Manual fee claim",
      });

      await this.createPositionSnapshotAfterFeeClaim(
        position.id,
        priceXUSD,
        priceYUSD,
        totalClaimedFeeUSD
      );

      logger.info(
        `[Position] Fee claimed successfully for position ${position.id}: ${totalClaimedFeeUSD.toString()} USD`
      );
    } catch (error) {
      console.error(error);
      logger.error(
        `[Position] Error handling position created: ${error}`,
        error
      );
    }
  }

  private async createPositionSnapshotAfterFeeClaim(
    positionId: string,
    priceXUSD: Decimal,
    priceYUSD: Decimal,
    claimedFeeUSD: Decimal
  ) {
    const position = await db.query.positions.findFirst({
      where: eq(positions.id, positionId),
    });

    if (!position) {
      throw new Error("Position not found for snapshot");
    }

    const tokenXValueUSD = new Decimal(position.depositTokenXAmount || "0")
      .div(new Decimal(10).pow(position.tokenX?.decimals || 9))
      .mul(priceXUSD);

    const tokenYValueUSD = new Decimal(position.depositTokenYAmount || "0")
      .div(new Decimal(10).pow(position.tokenY?.decimals || 9))
      .mul(priceYUSD);

    const currentValueUSD = tokenXValueUSD.add(tokenYValueUSD);
    const initialValueUSD = new Decimal(position.initialValueUSD || "0");

    const unrealizedPnlUSD = currentValueUSD
      .minus(initialValueUSD)
      .add(claimedFeeUSD);
    const unrealizedPnlPct = initialValueUSD.gt(0)
      ? unrealizedPnlUSD.div(initialValueUSD).mul(100)
      : new Decimal(0);

    await db.insert(positionSnapshots).values({
      positionId,
      snapshotTimestamp: new Date(),
      currentValueUSD: currentValueUSD.toString(),
      unrealizedPnlUSD: unrealizedPnlUSD.toString(),
      unrealizedPnlPct: unrealizedPnlPct.toString(),
      tokenXAmount: position.depositTokenXAmount || "0",
      tokenYAmount: position.depositTokenYAmount || "0",
      unclaimedFeesUSD: "0", // Fees were just claimed
      priceXUSD: priceXUSD.toString(),
      priceYUSD: priceYUSD.toString(),
    });
  }

  private async handlePositionClosed(
    user: User,
    position: Position,
    signature: string
  ) {
    try {
      logger.info(
        `[Position] Closing position ${signature} for user ${user.id}`
      );
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

      const closeIx = meteoraParsedIxs.find(
        (ix) =>
          ix.instructionType === "close" &&
          ix.instructionName === "close_position_if_empty"
      );

      console.log("removeIx", removeIx);
      console.log("claimIx", claimIx);
      console.log("closeIx", closeIx);

      if (!removeIx || !claimIx || !closeIx) {
        throw new Error("No meteora instruction found");
      }

      const tokenMintX = position.tokenX?.address!;
      const tokenMintY = position.tokenY?.address!;

      const prices = await this.tokenPriceService.getPrices([
        tokenMintX!,
        tokenMintY!,
      ]);

      if (!prices || !prices[tokenMintX] || !prices[tokenMintY]) {
        throw new Error("No token price found");
      }

      const priceXUSD = new Decimal(prices[tokenMintX].price);
      const priceYUSD = new Decimal(prices[tokenMintY].price);

      const tokenXAmount = new Decimal(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );

      const tokenYAmount = new Decimal(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      const claimedFeeXAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );

      const claimedFeeYAmount = new Decimal(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      // Calculate USD values
      const tokenXValueUSD = tokenXAmount
        .div(new Decimal(10).pow(position.tokenX?.decimals!))
        .mul(priceXUSD);

      const tokenYValueUSD = tokenYAmount
        .div(new Decimal(10).pow(position.tokenY?.decimals!))
        .mul(priceYUSD);

      const claimedFeeXValueUSD = claimedFeeXAmount
        .div(new Decimal(10).pow(position.tokenX?.decimals!))
        .mul(priceXUSD);

      const claimedFeeYValueUSD = claimedFeeYAmount
        .div(new Decimal(10).pow(position.tokenY?.decimals!))
        .mul(priceYUSD);

      const totalClaimedFeeUSD = claimedFeeXValueUSD.add(claimedFeeYValueUSD);
      const finalValueUSD = tokenXValueUSD
        .add(tokenYValueUSD)
        .add(totalClaimedFeeUSD);
      const initialValueUSD = new Decimal(position.initialValueUSD || "0");

      const pnlInUsd = finalValueUSD.minus(initialValueUSD);
      const pnlPercentage = initialValueUSD.gt(0)
        ? pnlInUsd.div(initialValueUSD).mul(100)
        : new Decimal(0);

      // swap tokens to SOL
      const [tokenXInSOL, tokenYInSOL, claimedFeeXInSOL, claimedFeeYInSOL] =
        await Promise.all([
          // Token A swap
          (async () => {
            if (tokenMintX !== SOL_MINT) {
              try {
                logger.debug(`[Position] Swapping token ${tokenMintX} to SOL`);
                const tokenXToSolOrder = await jupiterService.getOrder({
                  inputMint: tokenMintX,
                  outputMint: SOL_MINT,
                  amount: tokenXAmount.toString(),
                  taker: user.walletAddress!,
                });

                const swapTxStr = tokenXToSolOrder.transaction;
                if (!swapTxStr) {
                  throw new Error("Failed to get swap transaction for Token A");
                }
                const swapTx = jupiterService.getOrderTransaction(swapTxStr);

                const { signedTransaction } =
                  await WalletService.signTransaction(user, swapTx);

                const tokenXToSolExecute = await jupiterService.executeOrder({
                  requestId: tokenXToSolOrder.requestId,
                  signedTransaction: Buffer.from(
                    signedTransaction.serialize()
                  ).toString("base64"),
                });

                if (tokenXToSolExecute.status === "Failed") {
                  throw new Error(
                    `Failed to convert SOL to token A: ${tokenXToSolExecute.error}`
                  );
                }

                logger.info(
                  `[Position] Swapped token ${tokenMintX} to SOL: ${tokenXToSolExecute.signature}`
                );

                return new Decimal(
                  tokenXToSolExecute.outputAmountResult || "0"
                );
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new Decimal(tokenXAmount);
            }
          })(),
          // token Y to SOL
          (async () => {
            if (tokenMintY !== SOL_MINT) {
              try {
                logger.debug(`[Position] Swapping token ${tokenMintY} to SOL`);
                const tokenYToSolOrder = await jupiterService.getOrder({
                  inputMint: tokenMintY,
                  outputMint: SOL_MINT,
                  amount: tokenYAmount.toString(),
                  taker: user.walletAddress!,
                });

                const swapTxStr = tokenYToSolOrder.transaction;
                if (!swapTxStr) {
                  throw new Error("Failed to get swap transaction for Token Y");
                }
                const swapTx = jupiterService.getOrderTransaction(swapTxStr);

                const { signedTransaction } =
                  await WalletService.signTransaction(user, swapTx);

                const tokenYToSolExecute = await jupiterService.executeOrder({
                  requestId: tokenYToSolOrder.requestId,
                  signedTransaction: Buffer.from(
                    signedTransaction.serialize()
                  ).toString("base64"),
                });

                if (tokenYToSolExecute.status === "Failed") {
                  throw new Error(
                    `Failed to convert SOL to token Y: ${tokenYToSolExecute.error}`
                  );
                }

                logger.info(
                  `[Position] Swapped token ${tokenMintY} to SOL: ${tokenYToSolExecute.signature}`
                );

                return new Decimal(
                  tokenYToSolExecute.outputAmountResult || "0"
                );
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new Decimal(tokenYAmount);
            }
          })(),
          // claim fee x to SOL
          (async () => {
            if (tokenMintX !== SOL_MINT) {
              try {
                logger.debug(`[Position] Swapping fee ${tokenMintX} to SOL`);
                const claimFeeXToSolOrder = await jupiterService.getOrder({
                  inputMint: tokenMintX,
                  outputMint: SOL_MINT,
                  amount: claimedFeeXAmount.toString(),
                  taker: user.walletAddress!,
                });

                const swapTxStr = claimFeeXToSolOrder.transaction;
                if (!swapTxStr) {
                  throw new Error("Failed to get swap transaction for Token A");
                }
                const swapTx = jupiterService.getOrderTransaction(swapTxStr);

                const { signedTransaction } =
                  await WalletService.signTransaction(user, swapTx);

                const claimFeeXToSolExecute = await jupiterService.executeOrder(
                  {
                    requestId: claimFeeXToSolOrder.requestId,
                    signedTransaction: Buffer.from(
                      signedTransaction.serialize()
                    ).toString("base64"),
                  }
                );

                if (claimFeeXToSolExecute.status === "Failed") {
                  throw new Error(
                    `Failed to convert SOL to token A: ${claimFeeXToSolExecute.error}`
                  );
                }

                logger.info(
                  `[Position] Swapped fee ${tokenMintX} to SOL: ${claimFeeXToSolExecute.signature}`
                );

                return new Decimal(
                  claimFeeXToSolExecute.outputAmountResult || "0"
                );
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new Decimal(claimedFeeXAmount);
            }
          })(),
          // claim fee y to SOL
          (async () => {
            if (tokenMintY !== SOL_MINT) {
              try {
                logger.debug(`[Position] Swapping fee ${tokenMintY} to SOL`);
                const claimFeeYToSolOrder = await jupiterService.getOrder({
                  inputMint: tokenMintY,
                  outputMint: SOL_MINT,
                  amount: claimedFeeYAmount.toString(),
                  taker: user.walletAddress!,
                });

                const swapTxStr = claimFeeYToSolOrder.transaction;
                if (!swapTxStr) {
                  throw new Error("Failed to get swap transaction for Token A");
                }
                const swapTx = jupiterService.getOrderTransaction(swapTxStr);

                const { signedTransaction } =
                  await WalletService.signTransaction(user, swapTx);

                const claimFeeYToSolExecute = await jupiterService.executeOrder(
                  {
                    requestId: claimFeeYToSolOrder.requestId,
                    signedTransaction: Buffer.from(
                      signedTransaction.serialize()
                    ).toString("base64"),
                  }
                );

                if (claimFeeYToSolExecute.status === "Failed") {
                  throw new Error(
                    `Failed to convert SOL to token A: ${claimFeeYToSolExecute.error}`
                  );
                }

                logger.info(
                  `[Position] Swapped fee ${tokenMintY} to SOL: ${claimFeeYToSolExecute.signature}`
                );

                return new Decimal(
                  claimFeeYToSolExecute.outputAmountResult || "0"
                );
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new Decimal(claimedFeeYAmount);
            }
          })(),
        ]);

      const feesEarnedInSol = claimedFeeXInSOL.add(claimedFeeYInSOL);
      const finalValueInSOL = tokenXInSOL
        .add(tokenYInSOL)
        .add(claimedFeeXInSOL)
        .add(claimedFeeYInSOL);
      const initialValueSOL = new Decimal(position.initialValueSOL || "0");
      const pnlInSol = finalValueInSOL.minus(initialValueSOL);

      // Update cumulative PnL
      const currentCumulativePnl = new Decimal(
        position.cumulativeAbsolutePnlUSD || "0"
      );
      const updatedCumulativePnl = currentCumulativePnl.add(pnlInUsd.abs());

      // const feesEarnedInSol = claimedFeeXInSOL.add(claimedFeeYInSOL);
      // const finalValueInSOL = tokenXInSOL
      //   .add(tokenYInSOL)
      //   .add(claimedFeeXInSOL)
      //   .add(claimedFeeYInSOL);
      // const pnlInSol = finalValueInSOL.sub(
      //   new BN(parseInt(position.initialValueSOL))
      // );
      // const pnlPercentage = finalValueInSOL
      //   .mul(new BN(100))
      //   .div(new BN(parseInt(position.initialValueSOL)));

      await updatePosition(position.id, {
        status: "CLOSED",
        closureSignature: signature,

        withdrawTokenXAmount: tokenXAmount.toString(),
        withdrawTokenYAmount: tokenYAmount.toString(),
        tokenXPriceAtClosure: priceXUSD.toString(),
        tokenYPriceAtClosure: priceYUSD.toString(),
        feeTokenXAmount: claimedFeeXAmount.toString(),
        feeTokenYAmount: claimedFeeYAmount.toString(),

        finalValueUSD: finalValueUSD.toString(),
        finalValueSol: finalValueInSOL.toString(),
        feesEarnedInSol: feesEarnedInSol.toString(),
        pnlInUsd: pnlInUsd.toString(),
        pnlInSol: pnlInSol.toString(),
        pnlPercentage: pnlPercentage.toString(),
        cumulativeAbsolutePnlUSD: updatedCumulativePnl.toString(),
      });

      await this.createFinalPositionSnapshot(
        position.id,
        priceXUSD,
        priceYUSD,
        finalValueUSD,
        pnlInUsd,
        pnlPercentage,
        tokenXAmount.toString(),
        tokenYAmount.toString(),
        totalClaimedFeeUSD
      );
    } catch (error) {
      console.error(error);
      logger.error(
        `[Position] Error handling position created: ${error}`,
        error
      );
    }
  }

  private async createFinalPositionSnapshot(
    positionId: string,
    priceXUSD: Decimal,
    priceYUSD: Decimal,
    finalValueUSD: Decimal,
    pnlInUsd: Decimal,
    pnlPercentage: Decimal,
    tokenXAmount: string,
    tokenYAmount: string,
    claimedFeeUSD: Decimal
  ) {
    await db.insert(positionSnapshots).values({
      positionId,
      snapshotTimestamp: new Date(),
      currentValueUSD: finalValueUSD.toString(),
      unrealizedPnlUSD: pnlInUsd.toString(), // Now realized
      unrealizedPnlPct: pnlPercentage.toString(),
      tokenXAmount,
      tokenYAmount,
      unclaimedFeesUSD: "0", // All fees claimed during closure
      priceXUSD: priceXUSD.toString(),
      priceYUSD: priceYUSD.toString(),
    });
  }

  async checkClaimFeeTx(signature: string) {
    const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
    // FIXME: add retry logic
    const parsedTransaction = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!parsedTransaction) {
      throw new Error(`Transaction not found or not confirmed: ${signature}`);
    }

    const meteoraParsedIxs = await parseMeteoraInstructions(parsedTransaction);
    if (meteoraParsedIxs.length === 0) {
      throw new Error("No meteora instruction found");
    }

    console.log("meteoraParsedIxs", meteoraParsedIxs);

    const claimIx = meteoraParsedIxs.find(
      (ix) =>
        ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
    );

    if (!claimIx) {
      throw new Error("No meteora instruction found");
    }

    console.dir(claimIx);
  }
}

export const positionService = new PositionService();
