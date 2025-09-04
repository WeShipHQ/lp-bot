import { User } from "@/db";
import { StrategyType } from "@meteora-ag/dlmm";
import type { Context } from "telegraf";

interface TransferState {
  type: "all_sol" | "specific_sol" | "all_tokens" | "specific_tokens" | "token";
  step:
    | "address_input"
    | "amount_input"
    | "confirmation"
    | "token_input"
    | "token_confirmation"
    | "token_confirmation_all";
  recipientAddress?: string;
  amount?: number;
  tokenMint?: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  decimals?: number;
}

interface TwoFactorVerificationState {
  action: "export_private_key" | "transfer" | "other";
  step: "waiting_for_code" | "verified";
  attempts?: number;
  maxAttempts?: number;
}

export interface BotContext extends Context {
  user: User;
  session?: {
    transferState?: TransferState;
    twoFactorVerification?: TwoFactorVerificationState;
  };
  scene: any;
  startPayload?: string;
}

// TODO move to a suiable folder
export type StrategyTypeKey = keyof typeof StrategyType;
export type MeteoraPoolType = "damm_v1" | "damm_v2" | "dlmm";
