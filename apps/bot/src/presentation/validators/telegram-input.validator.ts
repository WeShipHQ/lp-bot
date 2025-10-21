import { DexType, PoolType } from "@/types/core.types";

export class TelegramInputValidator {
  private readonly tokenAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  normalizeText(input: string): string {
    return (input || "").trim();
  }

  isLikelyUrl(input: string): boolean {
    const t = this.normalizeText(input);
    return t.startsWith("http://") || t.startsWith("https://");
  }

  isTokenAddress(input: string): boolean {
    const t = this.normalizeText(input);
    return this.tokenAddressPattern.test(t);
  }
}

export const telegramInputValidator = new TelegramInputValidator();
