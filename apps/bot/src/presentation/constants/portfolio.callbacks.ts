export const PF_PREFIX = "pf" as const;

export const PF_CALLBACKS = {
  overview: {
    refresh: `${PF_PREFIX}:overview:refresh`,
    close: `${PF_PREFIX}:overview:close`,
  },
  position: {
    refresh: (index: number) => `${PF_PREFIX}:pos:${index}:refresh`,
    claim: (index: number) => `${PF_PREFIX}:pos:${index}:claim`,
    rebalance: (index: number) => `${PF_PREFIX}:pos:${index}:rebalance`,
    close: (index: number) => `${PF_PREFIX}:pos:${index}:close`,
    settings: (index: number) => `${PF_PREFIX}:pos:${index}:settings`,
  },
} as const;

export const PF_PATTERNS = {
  overview: {
    refresh: new RegExp(`^${PF_PREFIX}:overview:refresh$`),
    close: new RegExp(`^${PF_PREFIX}:overview:close$`),
  },
  positionAction: new RegExp(`^${PF_PREFIX}:pos:(\\d+):(refresh|claim|rebalance|close|settings)$`),
} as const;
