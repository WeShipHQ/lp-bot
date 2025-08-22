import type { Context } from "telegraf";

interface TransferState {
  type: "all_sol" | "specific_sol" | "all_tokens" | "specific_tokens";
  step: "address_input" | "amount_input" | "confirmation";
  recipientAddress?: string;
  amount?: number;
  tokenMint?: string;
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
  };
}
