export const WALLET_PREFIX = "wallet" as const;

export const WALLET_CALLBACKS = {
  ui: {
    close: `${WALLET_PREFIX}:ui:close`,
    refresh: `${WALLET_PREFIX}:ui:refresh`,
  },
  transfer: {
    solAll: `${WALLET_PREFIX}:transfer:sol:all`,
    solAmount: `${WALLET_PREFIX}:transfer:sol:amount`,
    tokenAll: `${WALLET_PREFIX}:transfer:token:all`,
    tokenAmount: `${WALLET_PREFIX}:transfer:token:amount`,
    confirm: `${WALLET_PREFIX}:confirm`,
    cancel: `${WALLET_PREFIX}:cancel`,
  },
  export: {
    privateKey: `${WALLET_PREFIX}:export:private_key`,
    confirmFirst: `${WALLET_PREFIX}:export:confirm_first`,
    cancel: `${WALLET_PREFIX}:export:cancel`,
  },
} as const;

// Consolidated patterns to be used with Telegraf .action()
export const WALLET_PATTERNS = {
  any: new RegExp(
    `^${WALLET_PREFIX}:(?:` +
      [
        `ui:(?:close|refresh)`,
        `transfer:(?:sol|token):(?:all|amount)`,
        `export:(?:private_key|confirm_first|cancel)`,
        `confirm`,
        `cancel`,
      ].join("|") +
      `)$`
  ),
  ui: new RegExp(`^${WALLET_PREFIX}:ui:(close|refresh)$`),
  transfer:
    new RegExp(`^${WALLET_PREFIX}:transfer:(sol|token):(all|amount)$`),
  export: new RegExp(
    `^${WALLET_PREFIX}:export:(private_key|confirm_first|cancel)$`
  ),
  confirm: new RegExp(`^${WALLET_PREFIX}:confirm$`),
  cancel: new RegExp(`^${WALLET_PREFIX}:cancel$`),
} as const;
