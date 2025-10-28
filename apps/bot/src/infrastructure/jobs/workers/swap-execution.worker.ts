import { Job } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { IWorker } from "../worker-registry";
import { SwapExecutionJobData, JOB_TX_CONFIRM } from "../job-definitions";
import { logger } from "@/utils/logger";
import { db, pendingTransactions, users } from "@/db";
import { eq } from "drizzle-orm";
import { SwapService } from "@/services/swap.service";
import { SOL_MINT } from "@/config/constants";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { SolSwapMetadata } from "@/application";
import { rawToUiAmount, solToLamports } from "@/utils/number-utils";

export class SwapExecutionWorker implements IWorker<SwapExecutionJobData> {
  constructor(private readonly swapService: SwapService) {}

  async process(job: Job<SwapExecutionJobData>) {
    const {
      userId,
      inputMint,
      outputMint,
      outputDecimals,
      inputAmount,
      expectedOutputAmount,
      positionCreationId,
      swapIndex,
      dex,
      poolAddress,
    } = job.data;

    logger.info({
      userId,
      positionCreationId,
      swapIndex,
      inputMint,
      outputMint,
      inputAmount,
    }, "[SwapExecutionWorker] Processing swap execution");

    console.log("[SwapExecutionWorker] Processing swap execution", {
      userId,
      positionCreationId,
      swapIndex,
      inputMint,
      outputMint,
      inputAmount,
    });

    try {
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

      if (outputMint === SOL_MINT) {
        const swapSignature = uuidv4(); // Unique signature for this swap operation

        await db.insert(pendingTransactions).values({
          signature: swapSignature,
          operationType: "SOL_TO_TOKEN_SWAP",
          userId: user.id,
          status: "PENDING",
          group: positionCreationId,
          metadata: {
            positionCreationId,
            swapIndex,
            inputMint,
            outputMint,
            outputDecimals: outputDecimals,
            inputAmount,
            outputAmount: inputAmount, // Same as inputAmount for SOL→SOL swap
            expectedOutputAmount,
            dex,
            poolAddress,
          } as SolSwapMetadata,
          retryCount: 0,
          maxRetries: 3,
        });

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

        return {
          success: true,
          signature: swapSignature,
          outputAmount: inputAmount, // Same as inputAmount for SOL→SOL swap
          inputAmount,
        };
      }

      // Execute the swap
      const swapResult = await this.swapService.swapSolToToken(
        user,
        outputMint,
        solToLamports(inputAmount).toString()
      );

      if (!swapResult.result.success) {
        throw new Error(`Swap failed: ${swapResult.result.error}`);
      }

      logger.info({
        userId,
        positionCreationId,
        swapIndex,
        signature: swapResult.result.signature,
        inputAmount,
        outputAmount: swapResult.result.outputAmount,
      }, "[SwapExecutionWorker] Swap executed successfully");

      console.log("[SwapExecutionWorker] Swap executed successfully", {
        userId,
        positionCreationId,
        swapIndex,
        signature: swapResult.result.signature,
        inputAmount,
        outputAmount: swapResult.result.outputAmount,
      });

      const swapSignature = swapResult.result.signature;
      if (swapSignature) {
        await db.insert(pendingTransactions).values({
          signature: swapSignature,
          operationType: "SOL_TO_TOKEN_SWAP",
          userId: user.id,
          status: "PENDING",
          group: positionCreationId,
          metadata: {
            positionCreationId,
            swapIndex,
            inputMint,
            outputMint,
            outputDecimals: outputDecimals,
            inputAmount,
            outputAmount: rawToUiAmount(
              swapResult.result.outputAmount || 0,
              outputDecimals
            ).toString(),
            expectedOutputAmount,
            dex,
            poolAddress,
          } as SolSwapMetadata,
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
      logger.error({
        error,
        userId,
        positionCreationId,
        swapIndex,
      }, "[SwapExecutionWorker] Swap execution failed");

      // Check if user has sufficient balance
      if (error instanceof Error && error.message.includes("Insufficient")) {
        throw new Error(`Insufficient SOL balance for swap: ${error.message}`);
      }

      throw error;
    }
  }
}
