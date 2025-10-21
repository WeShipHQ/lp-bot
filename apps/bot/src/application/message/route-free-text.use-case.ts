import { DexType, PoolType } from "@/types/core.types";
import { ParsedInputResult } from "./parse-free-text.use-case";

export type RouteDecision =
  | {
      type: "enter_pool_detail";
      state: { poolAddress: string; dex: DexType; poolType?: PoolType };
    }
  | { type: "reply"; message: string }
  | { type: "continue" };

export class RouteFreeTextMessageUseCase {
  execute(parsed: ParsedInputResult): RouteDecision {
    switch (parsed.type) {
      case "pool": {
        const poolType = parsed.poolType || ("DLMM" as PoolType);
        if (poolType !== "DLMM") {
          return {
            type: "reply",
            message:
              "❌ Pool type not supported yet. Currently we support Meteora DLMM pools only.",
          };
        }
        return {
          type: "enter_pool_detail",
          state: {
            poolAddress: parsed.poolId,
            dex: parsed.dex,
            poolType: parsed.poolType,
          },
        };
      }

      case "token":
        return {
          type: "reply",
          message:
            "🚧 Token details are coming soon. Paste this address when opening a position to proceed.",
        };

      case "unknown":
      default:
        return { type: "continue" };
    }
  }
}

export const routeFreeTextMessageUseCase = new RouteFreeTextMessageUseCase();
