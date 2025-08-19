import type { Context } from "telegraf";

export interface BotContext extends Context {
  user: {
    id: string;
    walletAddress?: string;
    telegramUserId: string;
  };
}
