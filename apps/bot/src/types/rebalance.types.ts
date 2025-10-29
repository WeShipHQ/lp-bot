import { DexType, Token } from "@/types/core.types";

export type RebalanceStage = "close" | "creating" | "completed";

export interface RebalanceCloseSummary {
  withdrawnTokenA: string; // lamports
  withdrawnTokenB: string; // lamports
  claimedFeesTokenA?: string; // lamports
  claimedFeesTokenB?: string; // lamports
  totalTokenA?: string; // lamports
  totalTokenB?: string; // lamports
  solFromTokenA?: string; // lamports
  solFromTokenB?: string; // lamports
  totalSol?: string; // lamports
  swapSignaturesToSol?: {
    tokenA?: string;
    tokenB?: string;
  };
  slot?: number;
}

export interface RebalanceConversionSummary {
  solBudgetLamports: string;
  reserveLamports: string;
  solForTokenALamports: string;
  solForTokenBLamports: string;
  solToTokenSignatures?: {
    tokenA?: string;
    tokenB?: string;
  };
}

export interface RebalanceTokenPurchaseSummary {
  tokenALamports: string;
  tokenBLamports: string;
}

export interface RebalanceSessionMetadata {
  sessionId: string;
  stage: RebalanceStage;
  triggerReason: string;
  userId: string;
  walletId: string;
  userAddress: string;
  positionId: string;
  poolAddress: string;
  dex: DexType;
  oldPositionAddress?: string;
  newPositionAddress?: string;
  tokenA: Token;
  tokenB: Token;
  strategy?: string;
  rangeInterval?: number;
  autoRebalance?: boolean;
  rebalanceThreshold?: number;
  slPercentage?: number;
  tpPercentage?: number;
  closeSignature?: string;
  closeSummary?: RebalanceCloseSummary;
  conversions?: RebalanceConversionSummary;
  purchases?: RebalanceTokenPurchaseSummary;
  createSignature?: string;
  notes?: string;
  createdAt: string;
}
