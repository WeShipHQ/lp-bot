/**
 * Start Create Position Use Case
 * 
 * Simple use case that initiates the CREATE POSITION flow.
 * The flow state machine handles all orchestration.
 * 
 * This follows the proper pattern:
 * - Use case: Start the flow
 * - Flow: Define and orchestrate steps
 * - Worker: Execute transaction confirmation and finalization
 */

import { logger } from "@/utils/logger";
import { DexType, Token } from "@/types/core.types";
import { startCreatePositionFlow, CreatePositionFlowParams } from "@/services/flows/create-position-flow";
import { FlowStateMachine } from "@/services/flows/flow-state-machine";

export interface StartCreatePositionCommand {
  // User context
  userId: string;
  walletId: string;
  walletAddress: string;
  
  // Pool context
  dex: DexType;
  poolAddress: string;
  tokenA: Token;
  tokenB: Token;
  
  // Amounts (UI amounts as strings)
  tokenAAmount: string;
  tokenBAmount: string;
  
  // Strategy and configuration
  strategy?: string;
  depositMethod?: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;
  
  // Price range
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };
  
  // Risk management
  autoRebalance?: boolean;
  rebalanceThreshold?: number;
  slippage?: number;
  slPercentage?: string;
  tpPercentage?: string;
  
  // Optional rebalance session
  rebalanceSession?: any;
}

export interface StartCreatePositionResult {
  success: boolean;
  flowId?: string;
  error?: string;
}

/**
 * Use case to start create position flow
 */
export class StartCreatePositionUseCase {
  /**
   * Start the create position flow
   * The flow state machine will handle all orchestration
   */
  async execute(command: StartCreatePositionCommand): Promise<StartCreatePositionResult> {
    try {
      logger.info(
        {
          userId: command.userId,
          poolAddress: command.poolAddress,
          dex: command.dex,
          strategy: command.strategy,
        },
        "[StartCreatePosition] Initiating position creation flow"
      );

      // Start the flow - state machine handles everything
      const flow = await startCreatePositionFlow({
        userId: command.userId,
        walletAddress: command.walletAddress,
        walletId: command.walletId,
        poolAddress: command.poolAddress,
        dex: command.dex,
        tokenA: command.tokenA,
        tokenB: command.tokenB,
        tokenAAmount: command.tokenAAmount,
        tokenBAmount: command.tokenBAmount,
        strategy: command.strategy,
        depositMethod: command.depositMethod,
        solAmount: command.solAmount,
        autoRebalance: command.autoRebalance,
        rebalanceSession: command.rebalanceSession,
      });

      logger.info(
        { flowId: flow.flowId },
        "[StartCreatePosition] Flow started successfully"
      );

      return {
        success: true,
        flowId: flow.flowId,
      };
    } catch (error) {
      logger.error(
        { error, command },
        "[StartCreatePosition] Failed to start flow"
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to start position creation",
      };
    }
  }
}
