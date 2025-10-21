// /**
//  * @deprecated Legacy job queue (BullMQ) used in V1 services. Replaced by infrastructure/jobs/JobQueueService.
//  * New code should interact with the JobQueueService resolved from DI.
//  */
// import { Queue, Worker, Job, QueueOptions, WorkerOptions } from "bullmq";
// import Redis from "ioredis";
// import { logger } from "../utils/logger";
// import { RebalanceService } from "./rebalance.service";
// import { PriceMonitoringService } from "./price-monitoring.service";
// import { db } from "../db";
// import { pendingTransactions, positions, users } from "../db/schema";
// import { eq, and } from "drizzle-orm";
// import { CONFIG } from "@/config";
// import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
// import { parseMeteoraInstructions } from "@/utils/tx-parser";
// import { createPosition } from "@/db/queries";
// import { delay } from "@/utils/misc";
// import { JupiterService } from "./jupiter.service";
// import { TokenAdapter } from "@/adapters/token.adapter";
// import { PositionService } from "./position.service";
// import { TokenPriceService } from "./token-price.service";

// const PROCESSING_TX_QUEUE_NAME = "transaction-processing";
// const PROCESSING_TX_WORKER_NAME = "transaction-processing-worker";

// const POSITION_MONITOR_QUEUE_NAME = "position-monitor";
// const POSITION_MONITOR_WORKER_NAME = "position-monitor-worker";

// const _QUEUE_NAME = "position-monitor";

// // Job Types
// export interface PositionMonitorJobData {
//   userId: string;
//   positionId?: string;
// }

// export interface PriceAlertJobData {
//   tokenAddress: string;
//   threshold: number;
//   direction: "up" | "down";
// }

// export interface RebalanceJobData {
//   positionId: string;
//   userId: string;
//   strategy: "STANDARD" | "DIP_PROTECTION";
//   reason: string;
// }

// export interface TransactionProcessingJobData {
//   signature: string;
//   operationType:
//     | "CREATE_POSITION"
//     | "CLOSE_POSITION"
//     | "ADD_LIQUIDITY"
//     | "REMOVE_LIQUIDITY"
//     | "CLAIM_FEES"
//     | "REBALANCE";
//   userId: string;
// }

// export class JobQueueService {
//   private redis: Redis;

//   private positionMonitorQueue: Queue<PositionMonitorJobData>;
//   private positionMonitorWorker!: Worker<PositionMonitorJobData>;

//   private transactionProcessingWorker!: Worker<TransactionProcessingJobData>;
//   private transactionProcessingQueue!: Queue<TransactionProcessingJobData>;

//   // private rebalanceService: RebalanceService;
//   // private positionService: PositionService;
//   private jupiterService: JupiterService;
//   private tokenPriceService: TokenPriceService;
//   private tokenAdapter: TokenAdapter;

//   constructor() {
//     this.redis = new Redis(CONFIG.REDIS.URL, {
//       maxRetriesPerRequest: null,
//       lazyConnect: true,
//     });

//     const queueOptions: QueueOptions = {
//       connection: this.redis,
//       defaultJobOptions: {
//         removeOnComplete: 100, // Keep last 100 completed jobs
//         removeOnFail: 50, // Keep last 50 failed jobs
//         attempts: 3,
//         backoff: {
//           type: "exponential",
//           delay: 2000,
//         },
//       },
//     };

//     this.positionMonitorQueue = new Queue(
//       POSITION_MONITOR_QUEUE_NAME,
//       queueOptions
//     );
//     this.transactionProcessingQueue = new Queue(
//       PROCESSING_TX_QUEUE_NAME,
//       queueOptions
//     );

//     // this.rebalanceService = new RebalanceService();
//     this.jupiterService = new JupiterService();
//     this.tokenAdapter = new TokenAdapter();
//     // this.positionService = new PositionService();
//     this.tokenPriceService = new TokenPriceService();

//     this.initializeWorkers();
//   }

//   private initializeWorkers() {
//     const workerOptions: WorkerOptions = {
//       connection: this.redis,
//       concurrency: 5,
//       maxStalledCount: 1,
//       stalledInterval: 30000,
//     };

//     this.positionMonitorWorker = new Worker<PositionMonitorJobData>(
//       POSITION_MONITOR_QUEUE_NAME,
//       async (job: Job<PositionMonitorJobData>) => {
//         return this.processPositionMonitorJob(job);
//       },
//       workerOptions
//     );

//     this.transactionProcessingWorker = new Worker<TransactionProcessingJobData>(
//       PROCESSING_TX_QUEUE_NAME,
//       async (job: Job<TransactionProcessingJobData>) => {
//         return this.processTransactionJob(job);
//       },
//       workerOptions
//     );

//     // Error handling
//     [this.positionMonitorWorker, this.transactionProcessingWorker].forEach(
//       (worker) => {
//         worker.on("failed", (job, err) => {
//           logger.error(`Job ${job?.id} failed:`, err);
//         });

//         worker.on("error", (err) => {
//           logger.error("Worker error:", err);
//         });
//       }
//     );
//   }

//   async setupScheduledJobs() {
//     await this.positionMonitorQueue.obliterate({ force: true });
//     await delay(1000);
//     logger.info("Scheduled jobs setup completed");
//   }

//   async queuePositionMonitorJob(data: PositionMonitorJobData, delay?: number) {
//     return this.positionMonitorQueue.add("monitor-position", data, {
//       repeat: { pattern: "*/10 * * * * *" }, // Every hour
//       delay,
//       jobId: `monitor-${data.userId}-${data.positionId || "all"}-${Date.now()}`,
//     });
//   }

//   async queueTransactionProcessingJob(
//     data: TransactionProcessingJobData,
//     delay: number = 1000
//   ) {
//     await this.transactionProcessingQueue.add("process-transaction", data, {
//       delay,
//     });
//   }

//   // async createPositionMonitorJob(positionId: string, userId: string) {
//   //   logger.info(`createPositionMonitorJob ${positionId} ${userId}`);
//   //   const jobId = `position-monitor-${positionId}`;

//   //   await this.positionMonitorQueue.add(
//   //     "monitor-single-position",
//   //     { userId, positionId },
//   //     {
//   //       // repeat: { pattern: "0 * * * *" }, // Every hour
//   //       repeat: { pattern: "*/10 * * * * *" }, // Every hour
//   //       jobId,
//   //     }
//   //   );

//   //   logger.info(`Created monitoring job for position ${positionId}`);
//   //   return jobId;
//   // }

//   async removePositionMonitorJob(positionId: string) {
//     const jobId = `position-monitor-${positionId}`;

//     await this.positionMonitorQueue.removeRepeatable(
//       "monitor-single-position",
//       {
//         pattern: "0 * * * *",
//         jobId,
//       }
//     );

//     logger.info(`Removed monitoring job for position ${positionId}`);
//   }

//   // processing
//   private async processPositionMonitorJob(job: Job<PositionMonitorJobData>) {
//     const { userId, positionId } = job.data;

//     if (!userId || !positionId) return;

//     try {
//       logger.info(
//         `Processing position ${positionId} monitor job for user ${userId}`
//       );

//       const user = await db.query.users.findFirst({
//         where: eq(users.id, userId),
//       });

//       if (!user) return;

//       const position = await db.query.positions.findFirst({
//         where: eq(positions.id, positionId),
//       });

//       if (!position) return;

//       // const result = await this.rebalanceService.analyzePosition(
//       //   position.poolAddress,
//       //   position.positionAddress
//       // )

//       const result = {
//         isInRange: false,
//         activeBinId: 0,
//         positionLowerBinId: 0,
//         positionUpperBinId: 0,
//         distanceFromActive: 0,
//       };

//       if (!result.isInRange) {
//         // handle rebalance
//         // queue rebalance job
//         // const closeResult = await this.positionService.closePositionV2(
//         //   user,
//         //   position.poolAddress,
//         //   position.positionAddress
//         // );
//       }

//       return { processed: 1, results: [] };
//     } catch (error) {
//       logger.error(`Position monitor job failed for user ${userId}:`, error);
//       throw error;
//     }
//   }

//   // private async processRebalanceJob(job: Job<RebalanceJobData>) {
//   //   const { positionId, userId, strategy, reason } = job.data;

//   //   try {
//   //     logger.info(`Processing rebalance job for position ${positionId}`);

//   //     const result = await this.rebalanceService.executeRebalance(
//   //       positionId
//   //       // strategy
//   //     );

//   //     if (result.success) {
//   //       logger.info(`Rebalance completed for position ${positionId}:`, result);
//   //       return {
//   //         success: true,
//   //         transactionId: result.transactionId,
//   //         reason,
//   //         strategy,
//   //       };
//   //     } else {
//   //       throw new Error(result.error || "Rebalance failed");
//   //     }
//   //   } catch (error) {
//   //     logger.error(`Rebalance job failed for position ${positionId}:`, error);
//   //     throw error;
//   //   }
//   // }

//   private async processTransactionJob(job: Job<TransactionProcessingJobData>) {
//     const { signature, operationType, userId } = job.data;

//     try {
//       logger.info(
//         `Processing transaction job for user ${userId} ${operationType} ${signature}`
//       );

//       const [pendingTx] = await db
//         .select()
//         .from(pendingTransactions)
//         .where(eq(pendingTransactions.signature, signature));

//       if (!pendingTx) {
//         throw new Error(`Pending transaction not found: ${signature}`);
//       }

//       await db
//         .update(pendingTransactions)
//         .set({
//           status: "PROCESSING",
//           lastProcessedAt: new Date(),
//         })
//         .where(eq(pendingTransactions.signature, signature));

//       const connection = new Connection(CONFIG.SOLANA.RPC_URL, "confirmed");
//       // FIXME: add retry logic
//       const parsedTransaction = await connection.getParsedTransaction(
//         signature,
//         {
//           maxSupportedTransactionVersion: 0,
//         }
//       );

//       if (!parsedTransaction) {
//         throw new Error(`Transaction not found or not confirmed: ${signature}`);
//       }

//       console.log(
//         `[TransactionProcessor] Transaction confirmed, processing ${operationType}`
//       );

//       switch (operationType) {
//         case "CREATE_POSITION":
//           await this.processCreatePositionTransaction(
//             parsedTransaction,
//             signature,
//             pendingTx.metadata,
//             userId
//           );
//           break;
//         case "REBALANCE":
//           await this.processRebalanceTransaction(
//             parsedTransaction,
//             signature,
//             pendingTx.metadata,
//             userId
//           );
//           break;
//         default:
//           console.log(
//             `[TransactionProcessor] Operation type ${operationType} not implemented yet`
//           );
//       }

//       // Mark as completed
//       await db
//         .update(pendingTransactions)
//         .set({
//           status: "COMPLETED",
//           lastProcessedAt: new Date(),
//         })
//         .where(eq(pendingTransactions.signature, signature));

//       console.log(
//         `[TransactionProcessor] Successfully processed ${operationType}: ${signature}`
//       );
//     } catch (error) {
//       console.error(
//         `[TransactionProcessor] Error processing transaction ${signature}:`,
//         error
//       );

//       // Update retry count and status
//       const [currentTx] = await db
//         .select()
//         .from(pendingTransactions)
//         .where(eq(pendingTransactions.signature, signature));

//       if (currentTx) {
//         const newRetryCount = currentTx.retryCount + 1;
//         const newStatus =
//           newRetryCount >= currentTx.maxRetries ? "FAILED" : "RETRY";

//         await db
//           .update(pendingTransactions)
//           .set({
//             status: newStatus,
//             retryCount: newRetryCount,
//             errorMessage:
//               error instanceof Error ? error.message : "Unknown error",
//             lastProcessedAt: new Date(),
//           })
//           .where(eq(pendingTransactions.signature, signature));
//       }

//       throw error;
//     }
//   }

//   private async processCreatePositionTransaction(
//     transaction: ParsedTransactionWithMeta,
//     signature: string,
//     metadata: string | null,
//     userId: string
//   ) {
//     logger.info(`Processing create position transaction for user ${userId}`);

//     const meteoraParsedIxs = await parseMeteoraInstructions(transaction);
//     if (meteoraParsedIxs.length === 0) {
//       throw new Error("No meteora instruction found");
//     }

//     const openIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "open" &&
//         ix.instructionName === "initialize_position"
//     );

//     const addIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "add" &&
//         ix.instructionName === "add_liquidity_by_strategy2"
//     );

//     if (!openIx || !addIx) {
//       throw new Error("No meteora instruction found");
//     }

//     const positionAddress = openIx.accounts.position;
//     const poolAddress = openIx.accounts.lbPair;
//     const mintX = addIx.accounts.tokenXMint;
//     const mintY = addIx.accounts.tokenYMint;

//     if (!mintX || !mintY) {
//       throw new Error("No token mint found");
//     }

//     const { tokenX: jupiterTokenX, tokenY: jupiterTokenY } =
//       await this.jupiterService.getTokenPairInfo(mintX, mintY);

//     const tokenX = this.tokenAdapter.transformToken(jupiterTokenX);
//     const tokenY = this.tokenAdapter.transformToken(jupiterTokenY);

//     const prices = await this.tokenPriceService.getPrices([
//       tokenX.address,
//       tokenY.address,
//     ]);

//     if (!prices || !prices[tokenX.address] || !prices[tokenY.address]) {
//       throw new Error("No token price found");
//     }

//     const amountX =
//       addIx.tokenTransfers.find(
//         (transfer) => transfer.mint === addIx.accounts.tokenXMint
//       )?.amount ?? 0;

//     const amountY =
//       addIx.tokenTransfers.find(
//         (transfer) => transfer.mint === addIx.accounts.tokenYMint
//       )?.amount ?? 0;

//     if (amountX === 0 || amountY === 0) {
//       throw new Error("No token amount found");
//     }

//     const newPos = await createPosition({
//       userId,
//       positionAddress,
//       poolAddress,
//       tokenX,
//       tokenY,
//       strategyType: "DLMM",
//       tokenXAmount: amountX.toString(),
//       tokenYAmount: amountY.toString(),
//       status: "ACTIVE",
//       creationSignature: signature,
//       tokenXPriceAtCreation: prices[tokenX.address].price.toString(),
//       tokenYPriceAtCreation: prices[tokenY.address].price.toString(),
//       tokenXPriceAtClosure: "0",
//       tokenYPriceAtClosure: "0",
//       initialValueInSol: "0",
//       finalValueInSol: "0",
//       feesEarnedInSol: "0",
//       pnlInSol: "0",
//       pnlPercentage: "0",
//     });

//     if (newPos) {
//       this.queuePositionMonitorJob({
//         positionId: newPos.id,
//         userId,
//       });
//     }

//     console.log(
//       `[TransactionProcessor] Position created in database for signature: ${signature}`
//     );
//   }

//   private async processRebalanceTransaction(
//     transaction: ParsedTransactionWithMeta,
//     signature: string,
//     metadata: string | null,
//     userId: string
//   ) {
//     console.log(
//       `[TransactionProcessor] Processing REBALANCE for user ${userId}`
//     );

//     if (!metadata) {
//       throw new Error("Missing metadata for rebalance transaction");
//     }

//     const meteoraParsedIxs = await parseMeteoraInstructions(transaction);
//     if (meteoraParsedIxs.length === 0) {
//       throw new Error("No meteora instruction found");
//     }

//     console.log("---------------------------");
//     console.dir(meteoraParsedIxs, { depth: null });
//     console.log("---------------------------");

//     const removeIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "remove" &&
//         ix.instructionName === "remove_liquidity_by_range2"
//     );

//     const claimIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "claim" && ix.instructionName === "claim_fee2"
//     );

//     const closeIx = meteoraParsedIxs.find(
//       (ix) =>
//         ix.instructionType === "close" &&
//         ix.instructionName === "close_position_if_empty"
//     );

//     if (!removeIx || !claimIx || !closeIx) {
//       throw new Error("No meteora instruction found");
//     }

//     console.log(
//       `[TransactionProcessor] Position rebalanced in database for signature: ${signature}`
//     );

//     //     [
//     //   {
//     //     isHawksight: false,
//     //     signature: '3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp',
//     //     slot: 365060609,
//     //     blockTime: 1757172092,
//     //     instructionName: 'remove_liquidity_by_range2',
//     //     instructionType: 'remove',
//     //     accounts: {
//     //       position: '3qm8JDpEMqDLut2vyJVe1PnjXy4pYHgYpak8jPwSJVXW',
//     //       lbPair: 'GMeANduWzq5MkgaHgDCihHH8HHak8hvRji1FMKCZwt4j',
//     //       sender: '42MXihgbqSkKroVrnurgwt2X9kQGsr9pGx9Qnq4QUkht',
//     //       tokenXMint: '5XgpGK83mxVdcGuZxv7My99ZmuSzdJo4noLaaD4bpump',
//     //       tokenYMint: 'So11111111111111111111111111111111111111112',
//     //       userTokenX: '3wy1i6ks2UZrFiQ7Wy2Rt5xPHUkAafDeHSiAVef4We1F',
//     //       userTokenY: 'H8EEgiiDsMsnWaftwu4ZGCJDTQXzLGBDzPVrnxTKLxBC'
//     //     },
//     //     tokenTransfers: [
//     //       {
//     //         mint: '5XgpGK83mxVdcGuZxv7My99ZmuSzdJo4noLaaD4bpump',
//     //         amount: 23318770726
//     //       },
//     //       {
//     //         mint: 'So11111111111111111111111111111111111111112',
//     //         amount: 0
//     //       }
//     //     ],
//     //     activeBinId: -514,
//     //     removalBps: 10000
//     //   },
//     //   {
//     //     isHawksight: false,
//     //     signature: '3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp',
//     //     slot: 365060609,
//     //     blockTime: 1757172092,
//     //     instructionName: 'claim_fee2',
//     //     instructionType: 'claim',
//     //     accounts: {
//     //       position: '3qm8JDpEMqDLut2vyJVe1PnjXy4pYHgYpak8jPwSJVXW',
//     //       lbPair: 'GMeANduWzq5MkgaHgDCihHH8HHak8hvRji1FMKCZwt4j',
//     //       sender: '42MXihgbqSkKroVrnurgwt2X9kQGsr9pGx9Qnq4QUkht',
//     //       tokenXMint: '5XgpGK83mxVdcGuZxv7My99ZmuSzdJo4noLaaD4bpump',
//     //       tokenYMint: 'So11111111111111111111111111111111111111112',
//     //       userTokenX: '3wy1i6ks2UZrFiQ7Wy2Rt5xPHUkAafDeHSiAVef4We1F',
//     //       userTokenY: 'H8EEgiiDsMsnWaftwu4ZGCJDTQXzLGBDzPVrnxTKLxBC'
//     //     },
//     //     tokenTransfers: [
//     //       {
//     //         mint: '5XgpGK83mxVdcGuZxv7My99ZmuSzdJo4noLaaD4bpump',
//     //         amount: 790116613
//     //       },
//     //       {
//     //         mint: 'So11111111111111111111111111111111111111112',
//     //         amount: 3703797
//     //       }
//     //     ],
//     //     activeBinId: null,
//     //     removalBps: null
//     //   },
//     //   {
//     //     isHawksight: false,
//     //     signature: '3DP1SbuWJbEdJn22gvRiEJzXerpkTAJx5YXrjt3n29PYKw2NnNPr5BzqFkgeQB1iZvkf5hB8AiXNLKa5JkenvdVp',
//     //     slot: 365060609,
//     //     blockTime: 1757172092,
//     //     instructionName: 'close_position_if_empty',
//     //     instructionType: 'close',
//     //     accounts: {
//     //       position: '3qm8JDpEMqDLut2vyJVe1PnjXy4pYHgYpak8jPwSJVXW',
//     //       lbPair: '',
//     //       sender: '42MXihgbqSkKroVrnurgwt2X9kQGsr9pGx9Qnq4QUkht'
//     //     },
//     //     tokenTransfers: [],
//     //     activeBinId: null,
//     //     removalBps: null
//     //   }
//     // ]
//   }

//   // Queue Management
//   async getQueueStats() {
//     const [
//       positionStats,
//       //  priceStats,
//       // rebalanceStats
//     ] = await Promise.all([
//       this.positionMonitorQueue.getJobCounts(),
//       // this.priceAlertQueue.getJobCounts(),
//       // this.rebalanceQueue.getJobCounts(),
//     ]);

//     return {
//       positionMonitor: positionStats,
//       // priceAlert: priceStats,
//       // rebalance: rebalanceStats,
//     };
//   }

//   async pauseQueues() {
//     await Promise.all([
//       this.positionMonitorQueue.pause(),
//       // this.priceAlertQueue.pause(),
//       // this.rebalanceQueue.pause(),
//     ]);
//     logger.info("All queues paused");
//   }

//   async resumeQueues() {
//     await Promise.all([
//       this.positionMonitorQueue.resume(),
//       // this.priceAlertQueue.resume(),
//       // this.rebalanceQueue.resume(),
//     ]);
//     logger.info("All queues resumed");
//   }

//   async shutdown() {
//     logger.info("Shutting down job queue service...");

//     await Promise.all([
//       this.transactionProcessingWorker.close(),
//       this.positionMonitorWorker.close(),
//       // this.priceAlertWorker.close(),
//       // this.rebalanceWorker.close(),
//     ]);

//     await Promise.all([
//       this.transactionProcessingQueue.close(),
//       this.positionMonitorQueue.close(),
//       // this.priceAlertQueue.close(),
//       // this.rebalanceQueue.close(),
//     ]);

//     await this.redis.quit();
//     logger.info("Job queue service shutdown completed");
//   }
// }
