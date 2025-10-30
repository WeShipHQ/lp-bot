import { IPositionRepository } from "@/domain/position/position.repository";
import { validateWalletAddress } from "@/domain/position/position.validators";
import {
  DexType,
  ClosePositionResult as ClosePositionResultType,
  Token,
} from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import { DexRegistryLike } from "./create-position.use-case";
import {
  getCacheService,
  ICacheService,
} from "@/infrastructure/cache/cache.service";
import { CachePatterns } from "@/infrastructure/cache/cache-keys";
import { WalletService } from "@/services/wallet.service";
import { container } from "@/infrastructure/di/container";
import { GetPositionUseCase } from "./get-position.use-case";

export interface ClosePositionCommand {
  userId: string;
  positionId: string;
  userAddress: string;
  walletId: string;
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

export class ClosePositionUseCase {
  private readonly cache: ICacheService;
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike,
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

      const dbPosition = await this.positionRepository.findById(
        command.positionId
      );
      if (!dbPosition) {
        return { success: false, error: "Position not found" };
      }
      if (dbPosition.userId !== command.userId) {
        return {
          success: false,
          error: "Unauthorized: position does not belong to user",
        };
      }

      const getPositionUseCase = container.get(GetPositionUseCase);
      const result = await getPositionUseCase.execute({
        positionId: command.positionId,
        // positionAddress: dbPosition.positionAddress,
        // userId: command.userId,
        // userAddress: command.userAddress,
        // includePool: true,
        // includePrices: true,
      });

      if (!result.success || !result.position) {
        throw new Error(result.error ?? "Position not found");
      }

      const position = result.position;

      const dexType: DexType = position.dex;
      const positionAddress = position.address;

      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let txResult: ClosePositionResultType;
      try {
        txResult = await adapter.closePositionIxs({
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
          positionAddress,
        });
      } catch (error) {
        logger.error({ error }, "Adapter.closePosition failed");
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

      if (!command.walletId) {
        return {
          success: false,
          error: "Wallet ID is required to close position",
        };
      }

      let signature = "" as string | undefined;
      try {
        signature = await WalletService.signAndSendViaGateway(
          command.walletId,
          command.userAddress,
          txResult.instructions
        );
      } catch (err) {
        console.log("Transaction submission failed", { err, command });
        logger.error({ err, command }, "Transaction submission failed");
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
          positionAddress: positionAddress,
          poolAddress: position.poolAddress,
          closureReason: command.closureReason ?? "user_close",
          tokenA: position.tokenA,
          tokenB: position.tokenB,
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
        logger.error({ err }, "Failed to insert pending transaction (close)");
        return {
          success: false,
          error: "Failed to persist pending transaction for processing",
        };
      }

      try {
        dbPosition.close();
        await this.positionRepository.update(dbPosition);
      } catch (err) {
        logger.error({ err }, "Failed to update position status to CLOSED");
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
        logger.error(
          { err },
          "Failed to enqueue transaction confirmation job (close)"
        );
      }

      try {
        await this.cache.invalidate(
          CachePatterns.portfolioPattern(command.userId)
        );
        await this.cache.invalidate(
          CachePatterns.positionPattern(command.positionId)
        );
      } catch {}

      return { success: true, signature };
    } catch (error) {
      logger.error({ error }, "ClosePositionUseCase.execute unexpected error");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
