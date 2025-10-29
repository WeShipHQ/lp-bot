import { StrategyName, strategyRegistry } from "@/domain/strategies";

export const CP_PREFIX = "cp" as const;

const STRATEGY_PATTERN = strategyRegistry
  .getAvailableStrategies()
  .map((name) => name.replace(/[-]/g, "-"))
  .join("|");

export const CP_CALLBACKS = {
  strategy: (name: StrategyName) => `${CP_PREFIX}:strategy:${name}`,
  depositMethod: (method: "sol_auto_convert" | "single_sided") =>
    `${CP_PREFIX}:deposit:${method}`,
  token: (mint: string) => `${CP_PREFIX}:token:${mint}`,
  source: (src: "sol_convert" | "token_balance") => `${CP_PREFIX}:source:${src}`,
  amount: (val: string | number) => `${CP_PREFIX}:amount:${val}`,
  amountCustom: `${CP_PREFIX}:amount:custom`,
  percentage: (val: number) => `${CP_PREFIX}:percentage:${val}`,
  priceChange: (val: number) => `${CP_PREFIX}:price_change:${val}`,
  priceChangeCustom: `${CP_PREFIX}:price_change:custom`,
  rebalance: (yn: "yes" | "no") => `${CP_PREFIX}:rebalance:${yn}`,
  confirmYes: `${CP_PREFIX}:confirm:yes`,
  back: `${CP_PREFIX}:back`,
  cancel: `${CP_PREFIX}:cancel`,
} as const;

export const CP_PATTERNS = {
  strategy: new RegExp(`^${CP_PREFIX}:strategy:(${STRATEGY_PATTERN})$`),
  deposit: new RegExp(`^${CP_PREFIX}:deposit:(sol_auto_convert|single_sided)$`),
  token: new RegExp(`^${CP_PREFIX}:token:(.+)$`),
  source: new RegExp(`^${CP_PREFIX}:source:(sol_convert|token_balance)$`),
  amount: new RegExp(`^${CP_PREFIX}:amount:(\\d+\\.?\\d*)$`),
  percentage: new RegExp(`^${CP_PREFIX}:percentage:(\\d+)$`),
  priceChange: new RegExp(`^${CP_PREFIX}:price_change:(\\d+)$`),
  rebalance: new RegExp(`^${CP_PREFIX}:rebalance:(yes|no)$`),
} as const;
