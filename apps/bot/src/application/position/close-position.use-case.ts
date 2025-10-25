import { IPositionRepository } from "@/domain/position/position.repository";
import { validateWalletAddress } from "@/domain/position/position.validators";
import {
  DexType,
  ClosePositionResult as ClosePositionResultType,
} from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, User } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import {
  DexRegistryLike,
  ITransactionService,
} from "./create-position.use-case";

export interface ClosePositionCommand {
  user: User;
  // Required to identify ownership and for pending tx record
  userId: string;

  // Source of truth for which position to close
  positionId: string;

  // Execution context for submission (if adapter does not submit)
  userAddress: string; // wallet public key (base58)
  walletId?: string; // optional Privy wallet id if needed by transaction service

  // Closure reason
  closureReason?: "user_close" | "stop_loss" | "take_profit";
}

export interface PositionClosureContext {
  userId: string;
  positionId: string;
  positionAddress: string;
  poolAddress: string;
  closureReason: ClosePositionCommand["closureReason"];
  tokenA: Token;
  tokenB: Token;
}

export interface ClosePositionUCResult {
  success: boolean;
  signature?: string;
  error?: string;
}

import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CachePatterns, CacheKeys } from "@/infrastructure/cache/cache-keys";
import { WalletService } from "@/services/wallet.service";
import { Token } from "@/types/token.types";
import { SanctumGatewayOptions } from "@/services/sanctum-gateway.service";

export class ClosePositionUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
    private readonly transactionService: ITransactionService,
    cacheService?: ICacheService
  ) {
    this.cache = cacheService ?? getCacheService();
  }

  async execute(command: ClosePositionCommand): Promise<ClosePositionUCResult> {
    try {
      if (!command?.userId) {
        return { success: false, error: "User ID is required" };
      }
      if (!command?.positionId) {
        return { success: false, error: "Position ID is required" };
      }
      validateWalletAddress(command.userAddress);

      // Load position from repository to resolve dex and position address
      const position = await this.positionRepository.findById(
        command.positionId
      );
      if (!position) {
        return { success: false, error: "Position not found" };
      }
      if (position.userId !== command.userId) {
        return {
          success: false,
          error: "Unauthorized: position does not belong to user",
        };
      }

      const dexType: DexType = position.dex;
      const positionAddress = position.positionAddress;

      // Resolve adapter and build/execute close transaction
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let txResult: ClosePositionResultType;
      try {
        txResult = await adapter.closePositionIx({
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
          positionAddress,
        });
      } catch (error) {
        logger.error("Adapter.closePosition failed", { error });
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to build close transaction",
        };
      }

      if (!txResult?.success) {
        return {
          success: false,
          error: txResult?.error || "Close position failed",
        };
      }

      let signature = "" as string | undefined;
      try {
        if (await WalletService.isGatewayAvailable()) {
          console.log("[CreatePosition] Using Sanctum Gateway for transaction");

          signature = await WalletService.signAndSendTransactionWithGateway(
            command.user.walletId,
            command.user.walletAddress,
            txResult.instructions,
            [],
            [],
            {},
            {
              cuPriceRange: "high",
              jitoTipRange: "medium",
              expireInSlots: 150,
              deliveryMethodType: undefined,
              skipSimulation: false,
              skipPriorityFee: false,
            } as SanctumGatewayOptions
          );
        } else {
          console.log(
            "[CreatePosition] Gateway not available, using standard Jito method"
          );

          // Fallback to existing method
          signature = await WalletService.signAndSendTransactionWithJito(
            command.user,
            txResult.instructions,
            [],
            []
          );
        }
      } catch (err) {
        console.log("Transaction submission failed", { err, command });
        logger.error("Transaction submission failed", { err, command });
      }

      if (!signature) {
        return {
          success: false,
          error: "Transaction signature missing after submission attempt",
        };
      }

      try {
        const closeContext: PositionClosureContext = {
          userId: command.userId,
          positionId: command.positionId,
          positionAddress: position.positionAddress,
          poolAddress: position.poolAddress,
          closureReason: command.closureReason ?? "user_close",
          tokenA: position.tokenX as Token,
          tokenB: position.tokenY as Token,
        };

        const metadata = {
          command: {
            positionId: command.positionId,
            userId: command.userId,
            dex: dexType,
            positionAddress,
            poolAddress: position.poolAddress,
            closureReason: command.closureReason ?? "user_close",
          },
          closeContext,
        };

        await db.insert(pendingTransactions).values({
          signature,
          operationType: "CLOSE_POSITION",
          userId: command.userId,
          status: "PENDING",
          metadata,
          retryCount: 0,
          maxRetries: 3,
        });
      } catch (err) {
        logger.error("Failed to insert pending transaction (close)", { err });
        return {
          success: false,
          error: "Failed to persist pending transaction for processing",
        };
      }

      // Optimistically mark position as closed at application level
      try {
        position.close();
        // Note: we are not able to set closure signature via domain mapping yet
        await this.positionRepository.update(position);
      } catch (err) {
        logger.error("Failed to update position status to CLOSED", { err });
        // Do not fail the overall flow; background processor may reconcile later
      }

      // Enqueue confirmation job
      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: "CLOSE_POSITION",
            userId: command.userId,
            positionId: command.positionId,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (err) {
        logger.error("Failed to enqueue transaction confirmation job (close)", {
          err,
        });
      }

      try {
        // Invalidate caches: portfolio for user and this position
        await this.cache.invalidate(
          CachePatterns.portfolioPattern(command.userId)
        );
        await this.cache.invalidate(
          CachePatterns.positionPattern(command.positionId)
        );
      } catch {}

      return { success: true, signature };
    } catch (error) {
      logger.error("ClosePositionUseCase.execute unexpected error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
