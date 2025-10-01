// Enhanced message types for v2 architecture
export interface MessageConfig {
  text?: string;
  template?: string;
  variables?: Record<string, any>;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export interface MessageTemplate {
  template: string;
  variables?: Record<string, any>;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
}

export interface FormattedMessage {
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export interface MessageContext {
  userId?: string;
  username?: string;
  walletAddress?: string;
  solBalance?: number;
  usdValue?: number;
  botName?: string;
  [key: string]: any;
}

export type MessageKey = 
  // Commands
  | 'commands.start.welcome'
  | 'commands.start.welcomeWithWallet'
  | 'commands.start.welcomeReturning'
  | 'commands.start.referralSuccess'
  | 'commands.start.referralInvalid'
  | 'commands.start.referralAlreadyUsed'
  | 'commands.trending.fetching'
  | 'commands.trending.noResults'
  | 'commands.trending.error'
  | 'commands.portfolio.loading'
  | 'commands.portfolio.empty'
  | 'commands.portfolio.noWallet'
  | 'commands.wallet.loading'
  | 'commands.wallet.balance'
  | 'commands.help.main'
  
  // Errors
  | 'errors.generic'
  | 'errors.network'
  | 'errors.timeout'
  | 'errors.maintenance'
  | 'errors.unauthorized'
  | 'errors.invalidInput'
  | 'errors.missingRequired'
  | 'errors.formatError'
  | 'errors.poolNotFound'
  | 'errors.positionNotFound'
  | 'errors.walletNotFound'
  | 'errors.transactionFailed'
  | 'errors.insufficientBalance'
  | 'errors.userNotFound'
  | 'errors.authenticationFailed'
  | 'errors.twoFactorRequired'
  | 'errors.invalidCode'
  | 'errors.tooManyAttempts'
  
  // UI Loading States
  | 'ui.loading.generic'
  | 'ui.loading.fetchingData'
  | 'ui.loading.updating'
  | 'ui.loading.connecting'
  | 'ui.loading.calculating'
  | 'ui.loading.poolDetails'
  | 'ui.loading.positionDetails'
  | 'ui.loading.transaction'
  | 'ui.loading.closing'
  | 'ui.loading.claiming'
  | 'ui.loading.rebalancing'
  | 'ui.loading.transferring'
  | 'ui.loading.exporting'
  | 'ui.loading.tokenInfo'
  
  // UI Success States
  | 'ui.success.generic'
  | 'ui.success.positionCreated'
  | 'ui.success.positionClosed'
  | 'ui.success.feesClaimed'
  | 'ui.success.positionRebalanced'
  | 'ui.success.transferComplete'
  | 'ui.success.transferCancelled'
  | 'ui.success.exportComplete'
  | 'ui.success.exportCancelled'
  | 'ui.success.twoFactorEnabled'
  | 'ui.success.twoFactorDisabled'
  | 'ui.success.settingsUpdated'
  
  // Callback Responses
  | 'callbacks.buttonNotForYou'
  | 'callbacks.expiredAction'
  | 'callbacks.refreshed'
  | 'callbacks.alreadyUpToDate'
  | 'callbacks.invalidData'
  | 'callbacks.invalidFormat'
  | 'callbacks.invalidChatId'
  | 'callbacks.processing'
  | 'callbacks.cancelled'
  | 'callbacks.confirmed'
  | 'callbacks.backToOverview'
  | 'callbacks.closed'
  | 'callbacks.alreadyAtFirstPage'
  | 'callbacks.alreadyAtLastPage'
  | 'callbacks.readyToVerify'
  | 'callbacks.verificationRequired'
  
  // Two-Factor Authentication
  | 'twoFactor.menu'
  | 'twoFactor.alreadyEnabled'
  | 'twoFactor.notEnabled'
  | 'twoFactor.setup'
  | 'twoFactor.readyToVerify'
  | 'twoFactor.enabledSuccess'
  | 'twoFactor.invalidCode'
  | 'twoFactor.noSetupInProgress'
  | 'twoFactor.disableConfirm'
  | 'twoFactor.status'
  | 'twoFactor.requiredForExport'
  | 'twoFactor.verificationRequired'
  | 'twoFactor.tooManyAttempts'
  | 'twoFactor.invalidCodeWithAttempts'
  
  // Wallet Operations
  | 'wallet.export.firstTimeWarning'
  | 'wallet.export.success'
  | 'wallet.export.cancelled'
  | 'wallet.transfer.solRequest'
  | 'wallet.transfer.allSolRequest'
  | 'wallet.transfer.tokenRequest'
  | 'wallet.transfer.allTokensRequest'
  | 'wallet.transfer.confirmation'
  | 'wallet.transfer.success'
  | 'wallet.transfer.successWithAdjustment'
  | 'wallet.transfer.error'
  | 'wallet.transfer.processing'
  
  // Pool Operations
  | 'pool.details.loading'
  | 'pool.details.refreshing'
  | 'pool.details.closing'
  | 'pool.details.closed'
  | 'pool.details.failedToClose'
  
  // Position Operations
  | 'position.details.loading'
  | 'position.close.confirmation'
  | 'position.close.processing'
  | 'position.close.success'
  | 'position.claim.confirmation'
  | 'position.claim.processing'
  | 'position.claim.success'
  | 'position.rebalance.confirmation'
  | 'position.rebalance.processing'
  | 'position.rebalance.success'
  | 'position.create.summary'
  | 'position.create.building'
  | 'position.create.success'
  
  // Settings
  | 'settings.vaultAddress'
  | 'settings.gasPriority'
  | 'settings.rebalanceSchedule'
  | 'settings.unknownAction'
  
  // System
  | 'system.privateChatRequired'
  | 'system.processing'
  | 'system.comingSoon'
  | 'system.maintenance';

export type MessageVariables = Record<string, any>;

export interface MessageBundle {
  [category: string]: {
    [subcategory: string]: {
      [key: string]: MessageConfig;
    } | MessageConfig;
  } | MessageConfig;
}

export interface ValidationResult {
  isValid: boolean;
  missingVariables: string[];
  errors: string[];
}

export interface MessageFormatter {
  format(template: string, variables: Record<string, any>): string;
  validate(template: string, variables: Record<string, any>): ValidationResult;
}