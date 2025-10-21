// import { eq, and } from "drizzle-orm";
// import { db } from "../db";
// import { positions, users, rebalanceEvents, transactions } from "../db/schema";
// import type { Position, User, RebalanceStrategy } from "../db/schema";
// import { meteoraPoolService } from "./meteora/pool.service";
// import { CONFIG } from "../config";
// import { MeteoraDlmmService } from "./meteora/dlmm.service";
// import { logger } from "@/utils/logger";
// import { PositionService } from "./position.service";

// export interface ExecuteRebalanceParams {
//   positionId: string;
//   userId: string;
//   amountX: number | string;
//   amountY: number | string;
//   feeX: number | string;
//   feeY: number | string;
// }

// export interface RebalanceResult {
//   success: boolean;
//   transactionId?: string;
//   oldValue: number;
//   newValue: number;
//   feesCollected: number;
//   reason: string;
//   error?: string;
// }

// export interface RebalanceResult {
//   success: boolean;
//   transactionId?: string;
//   oldValue: number;
//   newValue: number;
//   feesCollected: number;
//   reason: string;
//   error?: string;
// }

// export interface RebalanceAnalysis {
//   shouldRebalance: boolean;
//   reason: string;
//   currentPrice: number;
//   priceChange: number;
//   positionHealth: number;
//   strategy: RebalanceStrategy;
// }

// export class RebalanceService {
//   private dlmmService = new MeteoraDlmmService();
//   private positionService = new PositionService();

//   async analyzePosition(
//     poolAddress: string,
//     positionAddress: string
//   ): Promise<{
//     isInRange: boolean;
//     activeBinId: number;
//     positionLowerBinId: number;
//     positionUpperBinId: number;
//     distanceFromActive: number;
//   }> {
//     return this.dlmmService.analyzePositionInRange(
//       poolAddress,
//       positionAddress
//     );
//   }

//   async executeRebalance(positionId: string): Promise<any> {
//     try {
//       logger.info(
//         `[Rebalance] Starting rebalance for position ${positionId}`
//       );

//       const position = await db.query.positions.findFirst({
//         where: eq(positions.id, positionId),
//       })

//       if(!position) {
//         throw new Error("Position not found")
//       }

//       const user = await db.query.users.findFirst({
//         where: eq(users.id, position.userId),
//       })

//       if(!user) {
//         throw new Error("User not found")
//       }

//       const { success, transactionId } = await this.positionService.closePosition(
//         user,
//         position.poolAddress,
//         position.positionAddress
//       )

//       if(!success) {
//         throw new Error("Failed to close position")
//       }

//       // close position
//       // swap token
//       // re-crease position

//       console.log(`[Rebalance] Successfully rebalanced position ${positionId}`);
//     } catch (error) {
//       console.error(
//         `[Rebalance] Error executing rebalance for ${positionId}:`,
//         error
//       );

//       // Ensure position status is reset on error
//       try {
//         await db
//           .update(positions)
//           .set({
//             status: "ACTIVE",
//             updatedAt: new Date(),
//           })
//           .where(eq(positions.id, positionId));
//       } catch (resetError) {
//         console.error(
//           `[Rebalance] Failed to reset position status:`,
//           resetError
//         );
//       }

//       return {
//         success: false,
//         oldValue: 0,
//         newValue: 0,
//         feesCollected: 0,
//         reason: "Rebalance execution failed",
//         error: error instanceof Error ? error.message : "Unknown error",
//       };
//     }
//   }
// }

// export const rebalanceService = new RebalanceService();
