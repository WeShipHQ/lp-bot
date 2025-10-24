import { IPositionRepository } from "@/domain/position/position.repository";
import { validateWalletAddress } from "@/domain/position/position.validators";
import { DexType, TransactionResult } from "@/types/core.types";
import { IDexAdapter } from "@/types/dex-adapter.interface";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, User } from "@/db";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { JOB_TX_CONFIRM } from "@/infrastructure/jobs/job-definitions";
import { DexRegistryLike } from "./create-position.use-case";
import { WalletService } from "@/services/wallet.service";

export interface ClaimFeesCommand {
  user: User;
  positionId: string;
}

export interface ClaimFeesResult {
  success: boolean;
  signature?: string;
  claimedFeesUsd?: number;
  error?: string;
}

export class ClaimFeesUseCase {
  constructor(
    private readonly positionRepository: IPositionRepository,
    private readonly dexRegistry: DexRegistryLike
  ) {}

  async execute(command: ClaimFeesCommand): Promise<ClaimFeesResult> {
    try {
      if (!command?.user) {
        return { success: false, error: "User information is required" };
      }
      if (!command?.positionId) {
        return { success: false, error: "Position ID is required" };
      }

      const user = command.user;
      if (!user?.walletAddress) {
        return { success: false, error: "Connected wallet is required" };
      }

      validateWalletAddress(user.walletAddress);

      const position = await this.positionRepository.findById(command.positionId);
      if (!position) {
        return { success: false, error: "Position not found" };
      }
      if (position.userId !== user.id) {
        return {
          success: false,
          error: "Unauthorized: position does not belong to user",
        };
      }

      const dexType: DexType = position.dex;
      const adapter: IDexAdapter = this.dexRegistry.get(dexType);

      let estimatedUnclaimedFeesUsd = 0;
      try {
        const onchain = await adapter.getPosition(position.positionAddress, {
          userAddress: user.walletAddress,
          poolAddress: position.poolAddress,
        });
        estimatedUnclaimedFeesUsd = Number(onchain.unclaimedFeesUsd || 0);
      } catch (error) {
        logger.warn("Failed to fetch on-chain position prior to claim", {
          error,
          positionId: position.id,
        });
      }

      let txResult: TransactionResult;
      try {
        txResult = await adapter.claimFees(position.positionAddress, {
          userAddress: user.walletAddress,
          poolAddress: position.poolAddress,
        } as any);
      } catch (error) {
        logger.error("adapter.claimFees failed", {
          error,
          positionAddress: position.positionAddress,
        });
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

      const instructions =
        (txResult.metadata?.instructions as any) ?? (txResult as any).instructions;

      if (!Array.isArray(instructions) || instructions.length === 0) {
        logger.error("No instructions returned from adapter.claimFees", {
          positionAddress: position.positionAddress,
        });
        return {
          success: false,
          error: "No claim instructions returned by DEX adapter",
        };
      }

      let signature: string | undefined;
      try {
        signature = await WalletService.signAndSendTransactionWithJito(
          user,
          instructions,
          [],
          []
        );
      } catch (error) {
        logger.error("Transaction submission failed", {
          error,
          userId: user.id,
        });
      }

      if (!signature) {
        return {
          success: false,
          error: "Transaction signature missing after submission attempt",
        };
      }

      const tokenXData = position.tokenX as any;
      const tokenYData = position.tokenY as any;

      const metadata = {
        command: {
          positionId: position.id,
          userId: user.id,
          dex: dexType,
          poolAddress: position.poolAddress,
        },
        claimContext: {
          userId: user.id,
          positionId: position.id,
          positionAddress: position.positionAddress,
          poolAddress: position.poolAddress,
          userAddress: user.walletAddress,
          dex: dexType,
          tokenAMint: tokenXData?.mint ?? tokenXData?.address,
          tokenBMint: tokenYData?.mint ?? tokenYData?.address,
          tokenASymbol: tokenXData?.symbol,
          tokenBSymbol: tokenYData?.symbol,
          tokenADecimals: tokenXData?.decimals ?? 0,
          tokenBDecimals: tokenYData?.decimals ?? 0,
          convertToSol: true,
          estimatedFeesUsd: estimatedUnclaimedFeesUsd,
        },
        adapterMetadata: txResult.metadata ?? {},
      };

      try {
        await db.insert(pendingTransactions).values({
          signature,
          operationType: "CLAIM_FEES",
          userId: user.id,
          status: "PENDING",
          metadata,
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch (error) {
        logger.error("Failed to insert pending transaction (claim fees)", {
          error,
          signature,
        });
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
            userId: user.id,
            positionId: position.id,
            positionAddress: position.positionAddress,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      } catch (error) {
        logger.error("Failed to enqueue transaction confirmation job (claim)", {
          error,
          signature,
        });
      }

      return {
        success: true,
        signature,
        claimedFeesUsd: estimatedUnclaimedFeesUsd,
      };
    } catch (error) {
      logger.error("ClaimFeesUseCase.execute unexpected error", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
