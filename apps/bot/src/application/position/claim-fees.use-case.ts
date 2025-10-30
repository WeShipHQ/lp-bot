import { IPositionRepository } from "@/domain/position/position.repository";
import { validateWalletAddress } from "@/domain/position/position.validators";
import {
  DexType,
  ClaimFeesResult as ClaimFeesResultType,
  Token,
} from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import { DexRegistryLike } from "./create-position.use-case";
import { WalletService } from "@/services/wallet.service";
import { container } from "@/infrastructure/di/container";
import { GetPositionUseCase } from "./get-position.use-case";

export interface ClaimFeesCommand {
  positionId: string;
  userId: string;
  walletAddress: string;
  walletId: string;
}

export interface ClaimFeesResult {
  success: boolean;
  signature?: string;
  claimedFeesUsd?: number;
  error?: string;
}

export type ClaimFeesContext = {
  userId: string;
  positionId: string;
  positionAddress: string;
  poolAddress: string;
  dex: DexType;
  userAddress: string;
  tokenA: Token;
  tokenB: Token;
  convertToSol?: boolean;
  estimatedFeesUsd?: number;
};

export class ClaimFeesUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike
  ) {}

  async execute(command: ClaimFeesCommand): Promise<ClaimFeesResult> {
    try {
      if (!command?.userId) {
        return { success: false, error: "User information is required" };
      }
      if (!command?.positionId) {
        return { success: false, error: "Position ID is required" };
      }

      if (!command.walletAddress) {
        return { success: false, error: "Connected wallet is required" };
      }

      validateWalletAddress(command.walletAddress);

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
        // userAddress: command.walletAddress ?? undefined,
        // includePool: true,
        // includePrices: true,
      });

      if (!result.success || !result.position) {
        throw new Error(result.error ?? "Position not found");
      }

      const position = result.position;

      const dexType: DexType = position.dex;
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let txResult: ClaimFeesResultType;
      try {
        txResult = await adapter.claimFeesIxs({
          poolAddress: position.poolAddress,
          userAddress: command.walletAddress,
          positionAddress: position.address,
        });
      } catch (error) {
        logger.error(
          {
            error,
            positionAddress: position.address,
          },
          "adapter.claimFees failed"
        );
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to build claim fees transaction",
        };
      }

      if (!txResult?.success) {
        return {
          success: false,
          error: txResult?.error ?? "Claim fees failed",
        };
      }

      if (
        !Array.isArray(txResult.instructions) ||
        txResult.instructions.length === 0
      ) {
        logger.error(
          {
            positionAddress: position.address,
          },
          "No instructions returned from adapter.claimFees"
        );
        return {
          success: false,
          error: "No claim instructions returned by DEX adapter",
        };
      }

      if (!command.walletId) {
        return {
          success: false,
          error: "Wallet ID is required to claim fees",
        };
      }

      let signature = "" as string | undefined;
      try {
        signature = await WalletService.signAndSendViaGateway(
          command.walletId,
          command.walletAddress,
          txResult.instructions,
          []
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

      const context: ClaimFeesContext = {
        userId: command.userId,
        positionId: position.id,
        positionAddress: position.address,
        poolAddress: position.poolAddress,
        userAddress: command.walletAddress,
        dex: dexType,
        tokenA: position.tokenA,
        tokenB: position.tokenB,
        convertToSol: true,
        estimatedFeesUsd: position.claimedFeesUsd,
      };

      const metadata = {
        command: {
          positionId: position.id,
          userId: command.userId,
          dex: dexType,
          poolAddress: position.poolAddress,
        },
        claimContext: context,
        // adapterMetadata: txResult.metadata ?? {},
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: "CLAIM_FEES",
          userId: command.userId,
          status: "PENDING",
          metadata,
          retryCount: 0,
          maxRetries: 3,
        });
      } catch (error) {
        logger.error(
          {
            error,
            signature,
          },
          "Failed to insert pending transaction (claim fees)"
        );
        return {
          success: false,
          error: "Failed to persist pending transaction for processing",
        };
      }

      try {
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature,
            operationType: "CLAIM_FEES",
            userId: command.userId,
            positionId: position.id,
            positionAddress: position.address,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (error) {
        logger.error(
          {
            error,
            signature,
          },
          "Failed to enqueue transaction confirmation job (claim)"
        );
      }

      return {
        success: true,
        signature,
        claimedFeesUsd: position.claimedFeesUsd,
      };
    } catch (error) {
      logger.error({ error }, "ClaimFeesUseCase.execute unexpected error");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
