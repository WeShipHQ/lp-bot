import { randomUUID } from "crypto";
import { IPositionRepository } from "@/domain/position/position.repository";
import { validateWalletAddress } from "@/domain/position/position.validators";
import { DexType } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, users } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import { DexRegistryLike } from "./create-position.use-case";
import { WalletService } from "@/services/wallet.service";
import { eq } from "drizzle-orm";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";
import { container } from "@/infrastructure/di/container";
import { GetPositionUseCase } from "./get-position.use-case";

export interface RebalancePositionCommand {
  userId: string;
  positionId: string;
  userAddress: string;
  walletId?: string;
  newStrategy?: string;
  slippage?: number;
  metadata?: Record<string, any>;
}

export interface RebalancePositionResult {
  success: boolean;
  signature?: string;
  newPositionAddress?: string;
  error?: string;
}

export interface RebalancePositionCommand {
  userId: string;
  positionId: string;
  newStrategy?: string;
  slippage?: number;
  forceRebalance?: boolean;
}

export class RebalancePositionUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike
  ) {}

  async execute(
    command: RebalancePositionCommand
  ): Promise<RebalancePositionResult> {
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

      const userRecord = await db.query.users.findFirst({
        where: eq(users.id, command.userId),
      });
      if (!userRecord) {
        return { success: false, error: "User not found" };
      }
      if (!userRecord.walletId || !userRecord.walletAddress) {
        return {
          success: false,
          error: "User wallet is not connected",
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
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let closeTx;
      try {
        closeTx = await adapter.closePositionIxs({
          userAddress: command.userAddress,
          poolAddress: position.poolAddress,
          positionAddress: position.address,
        });
      } catch (error) {
        logger.error({ error }, "Failed to build close position instructions");
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to build close position transaction",
        };
      }

      if (!closeTx?.success || !closeTx.instructions?.length) {
        return {
          success: false,
          error: closeTx?.error || "Unable to build close position transaction",
        };
      }

      let signature: string;
      try {
        signature = await WalletService.signAndSendViaGateway(
          userRecord.walletId,
          command.userAddress,
          closeTx.instructions,
          []
        );
      } catch (error) {
        logger.error({ error }, "Failed to submit close position transaction");
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to submit close position transaction",
        };
      }

      const sessionId = command.metadata?.sessionId ?? randomUUID();
      const triggerReason =
        (command.metadata?.trigger as string | undefined) ?? "manual";
      const strategy =
        command.newStrategy ?? (position as any)?.strategyType ?? "spot";
      const rangeInterval =
        (command.metadata?.rangeInterval as number | undefined) ?? 10;

      const rebalanceSession: RebalanceSessionMetadata = {
        sessionId,
        stage: "close",
        triggerReason,
        userId: command.userId,
        walletId: userRecord.walletId,
        userAddress: command.userAddress,
        positionId: command.positionId,
        poolAddress: position.poolAddress,
        dex: dexType,
        oldPositionAddress: position.address,
        tokenA: position.tokenA,
        tokenB: position.tokenA,
        strategy,
        rangeInterval,
        autoRebalance: (position as any)?.isRebalancingEnabled ?? false,
        rebalanceThreshold: (position as any)?.rebalanceThreshold,
        slPercentage: (position as any)?.slPercentage,
        tpPercentage: (position as any)?.tpPercentage,
        closeSignature: signature,
        createdAt: new Date().toISOString(),
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: "REBALANCE",
          userId: command.userId,
          status: "PENDING",
          metadata: {
            command: {
              positionId: command.positionId,
              userId: command.userId,
              dex: dexType,
              poolAddress: position.poolAddress,
              oldPositionAddress: position.address,
            },
            rebalanceSession,
          },
          retryCount: 0,
          maxRetries: 3,
        });
      } catch (error) {
        logger.error(
          { error },
          "Failed to record pending rebalance transaction"
        );
        return {
          success: false,
          error: "Failed to persist pending transaction for processing",
        };
      }

      try {
        dbPosition.startRebalancing();
        await this.positionRepository.update(dbPosition);
      } catch (error) {
        logger.warn(
          { error },
          "Failed to update position status to REBALANCING"
        );
      }

      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: "REBALANCE",
            userId: command.userId,
            positionId: command.positionId,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (error) {
        logger.warn({ error }, "Failed to enqueue rebalance confirmation job");
      }

      try {
        const { getCacheService } = await import(
          "@/infrastructure/cache/cache.service"
        );
        const { CachePatterns } = await import(
          "@/infrastructure/cache/cache-keys"
        );
        const cache = getCacheService();
        await cache.invalidate(CachePatterns.portfolioPattern(command.userId));
        await cache.invalidate(
          CachePatterns.positionPattern(command.positionId)
        );
      } catch (error) {
        logger.debug(
          { error },
          "Failed to invalidate cache after rebalance submission"
        );
      }

      return { success: true, signature };
    } catch (error) {
      logger.error(
        { error },
        "RebalancePositionUseCase.execute unexpected error"
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
