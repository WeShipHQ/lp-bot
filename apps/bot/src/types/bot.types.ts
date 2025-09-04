import type { Context } from "telegraf";

interface TransferState {
  type: "all_sol" | "specific_sol" | "all_tokens" | "specific_tokens" | "token";
  step: "address_input" | "amount_input" | "confirmation" | "token_input" | "token_confirmation" | "token_confirmation_all";
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
  user: {
    id: string;
    walletAddress?: string;
    walletId?: string;
    telegramUserId: string;
  };
  session?: {
    transferState?: TransferState;
    twoFactorVerification?: TwoFactorVerificationState;
  };
}
