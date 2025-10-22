const PREFIX = "pd" as const;

export const PositionDetailCallbacks = {
  CLOSE_CONFIRM: `${PREFIX}:close:confirm`,
  CLOSE_APPROVE: `${PREFIX}:close:yes`,
  CLOSE_DECLINE: `${PREFIX}:close:no`,
  CLAIM_CONFIRM: `${PREFIX}:claim:confirm`,
  CLAIM_APPROVE: (positionId: string) => `${PREFIX}:claim:yes:${positionId}`,
  CLAIM_DECLINE: `${PREFIX}:claim:no`,
  REBALANCE_CONFIRM: `${PREFIX}:rebalance:confirm`,
  REBALANCE_APPROVE: (positionId: string) => `${PREFIX}:rebalance:yes:${positionId}`,
  REBALANCE_DECLINE: `${PREFIX}:rebalance:no`,
  SETTINGS: (positionId: string) => `${PREFIX}:settings:${positionId}`,
  TAKE_PROFIT: (positionId: string) => `${PREFIX}:tp:${positionId}`,
  STOP_LOSS: (positionId: string) => `${PREFIX}:sl:${positionId}`,
  REFRESH: (positionId: string) => `${PREFIX}:refresh:${positionId}`,
} as const;

export const PositionDetailCallbackPatterns = {
  CLAIM_APPROVE: new RegExp(`^${PREFIX}:claim:yes:(.+)$`),
  REBALANCE_APPROVE: new RegExp(`^${PREFIX}:rebalance:yes:(.+)$`),
  SETTINGS: new RegExp(`^${PREFIX}:settings:(.+)$`),
  TAKE_PROFIT: new RegExp(`^${PREFIX}:tp:(.+)$`),
  STOP_LOSS: new RegExp(`^${PREFIX}:sl:(.+)$`),
  REFRESH: new RegExp(`^${PREFIX}:refresh:(.+)$`),
} as const;
