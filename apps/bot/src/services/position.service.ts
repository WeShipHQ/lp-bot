import { meteoraDlmmService } from "./meteora/dlmm.service";
import { JupiterService, jupiterService } from "./jupiter.service";
import BN from "bn.js";
import { WalletService } from "./wallet.service";
import { db, Position, positions, User } from "@/db";
import { SOL_MINT } from "@/config/constants";
import { meteoraPositionService } from "./meteora/position.service";
import {
  MeteoraCreatePositionStrategy,
  MeteoraDlmmPosition,
} from "@/types/meteora.types";
import { OPEN_POSITION_FEE } from "@/bot/config/constants";
import { StrategyType } from "@meteora-ag/dlmm";
import { poolService } from "./pool.service";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { JobQueueService } from "./job-queue.service";
import { createPosition, updatePosition } from "@/db/queries";
import { logger } from "@/utils/logger";
import { CONFIG } from "@/config";
import { parseMeteoraInstructions } from "@/utils/tx-parser";
import { TokenAdapter } from "@/adapters/token.adapter";
import { TokenPriceService } from "./token-price.service";
import { eq } from "drizzle-orm";

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

      // const signature =
      //   "ctq3LCBP1jnaEpotb1H7auqMbdzqeLzKSacLc1Dwg37itxSXs5FfYiBCVJzmgi31FBGjvF9soeVy5mJjgp4F9VJ";

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
    position: MeteoraDlmmPosition
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      console.log(
        `[Position] Closing position ${position.address} for user ${user.id}`
      );

      const { instructions } = await meteoraDlmmService.closePositionIx(
        new PublicKey(user.walletAddress),
        new PublicKey(position.pair_address),
        new PublicKey(position.address)
      );

      const transactionId = await WalletService.signAndSendTransaction(
        user,
        instructions
      );

      // @ts-expect-error
      async function swapToSol(positionAddress: string) {
        const { lbPosition, poolInfo } =
          await positionService.getPosition(positionAddress);
        const positionData = lbPosition?.positionData;
        if (!positionData || !poolInfo) return;

        const totalX = new BN(positionData.totalXAmount).add(positionData.feeX);
        const totalY = new BN(positionData.totalYAmount).add(positionData.feeY);

        console.log("totalX", totalX.toString());
        console.log("totalY", totalY.toString());

        if (poolInfo.tokenA.address !== SOL_MINT) {
          // swap x -> SOL
          const orderA = await jupiterService.getOrder({
            inputMint: poolInfo.tokenA.address,
            outputMint: SOL_MINT,
            amount: totalX.toString(),
            taker: user.walletAddress!,
          });

          const swapTxStr = orderA.transaction;
          console.log("swapTxStr", swapTxStr);
          if (!swapTxStr) {
            throw new Error("Failed to get swap transaction");
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
          console.log("executeA", executeA);

          if (executeA.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token A: ${executeA.error}`
            );
          }
        }

        if (poolInfo.tokenB.address !== SOL_MINT) {
          // swap y -> SOL
          const orderB = await jupiterService.getOrder({
            inputMint: poolInfo.tokenB.address,
            outputMint: SOL_MINT,
            amount: totalY.toString(),
            taker: user.walletAddress!,
          });
          console.log("orderB", orderB);

          const swapTxStr = orderB.transaction;
          if (!swapTxStr) {
            throw new Error("Failed to get swap transaction");
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

          console.log("executeB", executeB);

          if (executeB.status === "Failed") {
            throw new Error(
              `Failed to convert SOL to token B: ${executeB.error}`
            );
          }
        }
      }

      setTimeout(() => {
        swapToSol(position.address);
      }, 2000);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      console.error(`[Position] Error closing position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  async closePositionV2(
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

      // const transactionId =
      // "3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp";
      this.handlePositionClosed(user, position, transactionId);

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      console.error(`[Position] Error closing position:`, error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to close position",
      };
    }
  }

  async getPosition(positionAddress: string) {
    try {
      const position =
        await meteoraPositionService.getDlmmPosition(positionAddress);
      const poolInfo = await poolService.getPoolV2(position.pair_address);

      const { lbPosition } = await meteoraDlmmService.getPosition(
        positionAddress,
        position.pair_address
      );
      // console.log("lp pos", lbPosition);

      return { position, lbPosition, poolInfo };
    } catch (error) {
      console.error(
        `[Meteora] Error fetching DLMM position ${positionAddress}:`,
        error
      );
      return { position: null, lbPosition: null, poolInfo: null };
    }
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

      const newPos = await createPosition({
        userId: user.id,
        positionAddress,
        poolAddress,
        tokenX,
        tokenY,
        strategyType: "DLMM",
        status: "ACTIVE",
        creationSignature: signature,

        depositTokenXAmount: amountX.toString(),
        depositTokenYAmount: amountY.toString(),
        tokenXPriceAtCreation: prices[tokenX.address].price.toString(),
        tokenYPriceAtCreation: prices[tokenY.address].price.toString(),

        withdrawTokenXAmount: "0",
        withdrawTokenYAmount: "0",
        tokenXPriceAtClosure: "0",
        tokenYPriceAtClosure: "0",

        feeTokenXAmount: "0",
        feeTokenYAmount: "0",

        initialValueInSol: (amount * 10 ** 9).toString(),
        finalValueInSol: "0",
        feesEarnedInSol: "0",
        pnlInSol: "0",
        pnlInUsd: "0",
        pnlPercentage: "0",
      });

      console.log("new Position", newPos);

      if (newPos) {
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

      const tokenXAmount = new BN(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );

      const tokenYAmount = new BN(
        removeIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

      const claimedFeeXAmount = new BN(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintX)
          ?.amount ?? 0
      );

      const claimedFeeYAmount = new BN(
        claimIx.tokenTransfers.find((transfer) => transfer.mint === tokenMintY)
          ?.amount ?? 0
      );

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

                return new BN(tokenXToSolExecute.outputAmountResult || "0");
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new BN(tokenXAmount);
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

                return new BN(tokenYToSolExecute.outputAmountResult || "0");
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new BN(tokenYAmount);
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

                return new BN(claimFeeXToSolExecute.outputAmountResult || "0");
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new BN(claimedFeeXAmount);
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

                return new BN(claimFeeYToSolExecute.outputAmountResult || "0");
              } catch (error) {
                logger.error("Error converting SOL to token A:", error);
                throw error;
              }
            } else {
              return new BN(claimedFeeYAmount);
            }
          })(),
        ]);

      const feesEarnedInSol = claimedFeeXInSOL.add(claimedFeeYInSOL);
      const finalValueInSOL = tokenXInSOL
        .add(tokenYInSOL)
        .add(claimedFeeXInSOL)
        .add(claimedFeeYInSOL);
      const pnlInSol = finalValueInSOL.sub(
        new BN(parseInt(position.initialValueInSol))
      );
      const pnlPercentage = finalValueInSOL
        .mul(new BN(100))
        .div(new BN(parseInt(position.initialValueInSol)));

      // console.log("update pos", {
      //   status: "CLOSED",
      //   closureSignature: signature,
      //   tokenXPriceAtClosure:
      //     prices[removeIx.accounts.tokenXMint!].price.toString(),
      //   tokenYPriceAtClosure:
      //     prices[removeIx.accounts.tokenYMint!].price.toString(),
      //   feesEarnedInSol: feesEarnedInSol.toString(),
      //   finalValueInSol: finalValueInSOL.toString(),
      //   pnlInSol: pnlInSol.toString(),
      //   pnlPercentage: pnlPercentage.toString(),
      // });

      await updatePosition(position.id, {
        status: "CLOSED",
        closureSignature: signature,

        withdrawTokenXAmount: tokenXAmount.toString(),
        withdrawTokenYAmount: tokenYAmount.toString(),
        tokenXPriceAtClosure:
          prices[removeIx.accounts.tokenXMint!].price.toString(),
        tokenYPriceAtClosure:
          prices[removeIx.accounts.tokenYMint!].price.toString(),
        feeTokenXAmount: claimedFeeXAmount.toString(),
        feeTokenYAmount: claimedFeeYAmount.toString(),

        feesEarnedInSol: feesEarnedInSol.toString(),
        finalValueInSol: finalValueInSOL.toString(),
        pnlInSol: pnlInSol.toString(),
        pnlPercentage: pnlPercentage.toString(),
      });

      console.log("removeIx", removeIx);
      console.log("claimIx", claimIx);
      console.log("closeIx", closeIx);
    } catch (error) {
      console.error(error);
      logger.error(
        `[Position] Error handling position created: ${error}`,
        error
      );
    }
  }
}

export const positionService = new PositionService();
