import { Job } from "bullmq";
import { IWorker } from "../worker-registry";
import { SwapExecutionJobData, JOB_TX_CONFIRM } from "../job-definitions";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, users } from "@/db";
import { eq } from "drizzle-orm";
import { SwapService } from "@/services/swap.service";
import { WalletService } from "@/services/wallet.service";
import { SOL_MINT } from "@/config/constants";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { nanoid } from "nanoid";
import { nanoid } from "nanoid";
import { uiToRawAmount } from "@/utils/number-utils";

export class SwapExecutionWorker implements IWorker<SwapExecutionJobData> {
  constructor(private readonly swapService: SwapService) {}

  async process(job: Job<SwapExecutionJobData>) {
    const {
      userId,
      walletId,
      walletAddress,
      inputMint,
      outputMint,
      inputAmount,
      expectedOutputAmount,
      positionCreationId,
      swapIndex,
      dex,
      poolAddress,
    } = job.data;

    logger.info("[SwapExecutionWorker] Processing swap execution", {
      userId,
      positionCreationId,
      swapIndex,
      inputMint,
      outputMint,
      inputAmount,
    });

    try {
      // Validate user exists
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });

      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Validate this is a SOL→Token swap
      if (inputMint !== SOL_MINT) {
        throw new Error("SwapExecutionWorker only supports SOL→Token swaps");
      }

      // Execute the swap
      const swapResult = await this.swapService.swapSolToToken(
        user,
        outputMint,
        inputAmount
      );

      if (!swapResult.result.success) {
        throw new Error(`Swap failed: ${swapResult.result.error}`);
      }

      logger.info("[SwapExecutionWorker] Swap executed successfully", {
        userId,
        positionCreationId,
        swapIndex,
        signature: swapResult.result.signature,
        inputAmount,
        outputAmount: swapResult.result.outputAmount,
      });

      // Store swap result in pending transactions for tracking
      const swapSignature = swapResult.result.signature;
      if (swapSignature) {
        await db.insert(pendingTransactions).values({
          signature: swapSignature,
          operationType: "SOL_TO_TOKEN_SWAP",
          userId: user.id,
          status: "PENDING",
          metadata: {
            positionCreationId,
            swapIndex,
            inputMint,
            outputMint,
            inputAmount,
            outputAmount: swapResult.result.outputAmount,
            expectedOutputAmount,
            dex,
            poolAddress,
          },
          retryCount: 0,
          maxRetries: 3,
        });

        // Enqueue transaction confirmation job
        const jobQueue = new JobQueueService({ producerOnly: true });
        await jobQueue.enqueue(
          JOB_TX_CONFIRM,
          {
            signature: swapSignature,
            operationType: "SOL_TO_TOKEN_SWAP",
            userId: user.id,
            submittedAt: Date.now(),
          },
          { delay: 500 }
        );
      }

      return {
        success: true,
        signature: swapResult.result.signature,
        outputAmount: swapResult.result.outputAmount,
        inputAmount: swapResult.result.inputAmount,
      };
    } catch (error) {
      logger.error("[SwapExecutionWorker] Swap execution failed", {
        error,
        userId,
        positionCreationId,
        swapIndex,
      });

      // Check if user has sufficient balance
      if (error instanceof Error && error.message.includes("Insufficient")) {
        throw new Error(`Insufficient SOL balance for swap: ${error.message}`);
      }

      throw error;
    }
  }
}