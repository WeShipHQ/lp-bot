import { DexType, PoolType } from "@/types/core.types";
import { ParsedInputResult } from "./parse-free-text.use-case";

export type RouteDecision =
  | {
      type: "enter_pool_detail";
      state: { poolAddress: string; dex: DexType; poolType?: PoolType };
    }
  | {
      type: "unsupported_pool_type";
      payload: { poolType: PoolType | undefined; dex: DexType };
    }
  | {
      type: "token_search_unavailable";
      payload: { tokenAddress: string };
    }
  | { type: "continue" };

export class RouteFreeTextMessageUseCase {
  execute(parsed: ParsedInputResult): RouteDecision {
    switch (parsed.type) {
      case "pool": {
        const poolType = parsed.poolType || ("DLMM" as PoolType);
        if (poolType !== "DLMM") {
          return {
            type: "unsupported_pool_type",
            payload: { poolType, dex: parsed.dex },
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
          type: "token_search_unavailable",
          payload: { tokenAddress: parsed.tokenAddress },
        };

      case "unknown":
      default:
        return { type: "continue" };
    }
  }
}
