import { Token } from "@/types/token.types";
import { DexType } from "@/types/core.types";
import { RebalanceSessionMetadata } from "@/types/rebalance.types";

/**
 * Base metadata interface for all transaction types
 */
export interface BaseTransactionMetadata {
  userId: string;
  submittedAt: number;
  walletAddress: string;
  walletId?: string;
}

/**
 * Metadata for CREATE_POSITION operations
 */
export interface CreatePositionMetadata extends BaseTransactionMetadata {
  operationType: "CREATE_POSITION";
  
  // Pool context
  dex: DexType;
  poolAddress: string;
  tokenA: Token;
  tokenB: Token;
  strategy: string;

  // Deposit details
  depositMethod: "sol_auto_convert" | "single_sided";
  depositSource?: "sol_convert" | "token_balance";
  solAmount?: number;

  // Token amounts (UI amounts as strings)
  tokenAAmount: string;
  tokenBAmount: string;

  // Price range
  priceRange?: {
    min: number;
    max: number;
    rangeInterval: number;
  };

  // Risk management
  autoRebalance: boolean;
  rebalanceThreshold?: number;
  slPercentage?: number;
  tpPercentage?: number;

  // Transaction metadata
  expectedFeesLamports?: number;
  slippage?: number;

  // Position address from adapter (if available before confirmation)
  positionAddress?: string;

  // Optional rebalance metadata when creation is part of a rebalance flow
  rebalanceSession?: RebalanceSessionMetadata;
}

/**
 * Metadata for CLAIM_FEES operations
 */
export interface ClaimFeesMetadata extends BaseTransactionMetadata {
  operationType: "CLAIM_FEES";
  
  // Position context
  positionId: string;
  positionAddress: string;
  poolAddress: string;
  
  // Token information
  tokenA: Token;
  tokenB: Token;
  
  // Fee claim settings
  convertToSol: boolean;
  estimatedFeesUsd?: number;
}

/**
 * Metadata for CLOSE_POSITION operations
 */
export interface ClosePositionMetadata extends BaseTransactionMetadata {
  operationType: "CLOSE_POSITION";
  
  // Position context
  positionId: string;
  positionAddress: string;
  poolAddress: string;
  
  // Token information
  tokenA: Token;
  tokenB: Token;
  
  // Closure reason
  closureReason: "user_close" | "stop_loss" | "take_profit";
  
  // Optional rebalance metadata when close is part of a rebalance flow
  rebalanceSession?: RebalanceSessionMetadata;
}

/**
 * Metadata for REBALANCE operations (if tracked separately)
 */
export interface RebalanceMetadata extends BaseTransactionMetadata {
  operationType: "REBALANCE";
  
  // Position context
  positionId: string;
  positionAddress: string;
  poolAddress: string;
  
  // Rebalancing session
  rebalanceSession: RebalanceSessionMetadata;
}

/**
 * Union type for all transaction metadata types
 */
export type TransactionMetadata = 
  | CreatePositionMetadata
  | ClaimFeesMetadata
  | ClosePositionMetadata
  | RebalanceMetadata;

/**
 * Type guard functions for runtime type checking
 */
export function isCreatePositionMetadata(metadata: any): metadata is CreatePositionMetadata {
  return metadata?.operationType === "CREATE_POSITION";
}

export function isClaimFeesMetadata(metadata: any): metadata is ClaimFeesMetadata {
  return metadata?.operationType === "CLAIM_FEES";
}

export function isClosePositionMetadata(metadata: any): metadata is ClosePositionMetadata {
  return metadata?.operationType === "CLOSE_POSITION";
}

export function isRebalanceMetadata(metadata: any): metadata is RebalanceMetadata {
  return metadata?.operationType === "REBALANCE";
}

/**
 * Helper function to parse metadata from JSON with type safety
 */
export function parseTransactionMetadata(jsonString: string): TransactionMetadata | null {
  try {
    const parsed = JSON.parse(jsonString);
    
    if (!parsed.operationType) {
      return null;
    }
    
    switch (parsed.operationType) {
      case "CREATE_POSITION":
        return parsed as CreatePositionMetadata;
      case "CLAIM_FEES":
        return parsed as ClaimFeesMetadata;
      case "CLOSE_POSITION":
        return parsed as ClosePositionMetadata;
      case "REBALANCE":
        return parsed as RebalanceMetadata;
      default:
        return null;
    }
  } catch (error) {
    console.error("Failed to parse transaction metadata:", error);
    return null;
  }
}

/**
 * Helper function to serialize metadata to JSON
 */
export function serializeTransactionMetadata(metadata: TransactionMetadata): string {
  return JSON.stringify(metadata);
}