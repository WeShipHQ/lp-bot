export const ST_PREFIX = "st" as const;

export type GasPriority = "low" | "medium" | "high";
export type RebalanceSchedule = "15m" | "1h" | "4h" | "12h" | "1d" | "custom";

export const ST_CALLBACKS = {
  refresh: `${ST_PREFIX}:refresh`,
  vaultSet: `${ST_PREFIX}:vault:set`,
  gasSet: (level: GasPriority) => `${ST_PREFIX}:gas:set:${level}`,
  scheduleSet: (value: RebalanceSchedule) => `${ST_PREFIX}:schedule:set:${value}`,
} as const;

export const ST_PATTERNS = {
  refresh: new RegExp(`^${ST_PREFIX}:refresh$`),
  vaultSet: new RegExp(`^${ST_PREFIX}:vault:set$`),
  gasSet: new RegExp(`^${ST_PREFIX}:gas:set:(low|medium|high)$`),
  scheduleSet: new RegExp(`^${ST_PREFIX}:schedule:set:(15m|1h|4h|12h|1d|custom)$`),
} as const;
