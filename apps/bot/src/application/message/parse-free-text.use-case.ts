import { DexType, PoolType } from "@/types/core.types";
import { dexRegistry } from "@/services/dex-registry.service";
import { telegramInputValidator } from "@/presentation/validators/telegram-input.validator";

export interface ParseFreeTextMessageRequest {
  text: string;
}

export type ParsedInputResult =
  | {
      type: "pool";
      originalInput: string;
      dex: DexType;
      poolId: string;
      poolType?: PoolType;
    }
  | {
      type: "token";
      originalInput: string;
      tokenAddress: string;
    }
  | {
      type: "unknown";
      originalInput: string;
    };

export class ParseFreeTextMessageUseCase {
  execute(request: ParseFreeTextMessageRequest): ParsedInputResult {
    const input = telegramInputValidator.normalizeText(request.text);

    // 1) Try parse via DEX adapters (URL)
    const urlResult = dexRegistry.parseUrl(input);
    if (urlResult) {
      return {
        type: "pool",
        originalInput: input,
        dex: urlResult.result.dex,
        poolId: urlResult.result.poolId,
        poolType: urlResult.result.poolType,
      };
    }

    // 2) Try token address
    if (telegramInputValidator.isTokenAddress(input)) {
      return {
        type: "token",
        originalInput: input,
        tokenAddress: input,
      };
    }

    // 3) Unknown
    return {
      type: "unknown",
      originalInput: input,
    };
  }
}

// export const parseFreeTextMessageUseCase = new ParseFreeTextMessageUseCase();
