import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";

export interface SendOptions {
  parse_mode?: "Markdown" | "HTML" | undefined;
  reply_markup?: any;
  link_preview_options?: { is_disabled?: boolean };
}

export interface ITelegramClient {
  sendMessage(chatId: number, text: string, options?: SendOptions): Promise<number>; // returns messageId
  editMessage(chatId: number, messageId: number, text: string, options?: SendOptions): Promise<void>;
  deleteMessage(chatId: number, messageId: number): Promise<void>;
}

export class TelegramClient implements ITelegramClient {
  private lastSentByChat = new Map<number, number>();
  private minIntervalMs = 50; // simple rate limit per chat

  constructor(private readonly bot: Telegraf<BotContext>) {}

  private async throttle(chatId: number): Promise<void> {
    const now = Date.now();
    const last = this.lastSentByChat.get(chatId) || 0;
    const wait = last + this.minIntervalMs - now;
    if (wait > 0) {
      await new Promise((res) => setTimeout(res, wait));
    }
    this.lastSentByChat.set(chatId, Date.now());
  }

  async sendMessage(chatId: number, text: string, options?: SendOptions): Promise<number> {
    await this.throttle(chatId);
    const msg = await this.bot.telegram.sendMessage(chatId, text, options as any);
    return (msg as any).message_id as number;
  }

  async editMessage(chatId: number, messageId: number, text: string, options?: SendOptions): Promise<void> {
    await this.throttle(chatId);
    await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, options as any);
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.throttle(chatId);
    await this.bot.telegram.deleteMessage(chatId, messageId);
  }
}
