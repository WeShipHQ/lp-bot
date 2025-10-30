import { DomainError } from '../shared/errors';

export class StartCommandError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'StartCommandError';
  }
}

export class UserCreationError extends StartCommandError {
  constructor(telegramId: string) {
    super(`Failed to create user for Telegram ID: ${telegramId}`, 'USER_CREATION_ERROR');
    this.name = 'UserCreationError';
  }
}

export class WalletDataFetchError extends StartCommandError {
  constructor(walletAddress: string, cause?: Error) {
    super(`Failed to fetch wallet data for address: ${walletAddress}`, 'WALLET_DATA_FETCH_ERROR');
    this.name = 'WalletDataFetchError';
    if (cause) {
      this.stack = cause.stack;
    }
  }
}

export class UnsupportedDeepLinkError extends StartCommandError {
  constructor(deepLinkType: string) {
    super(`Unsupported deep link type: ${deepLinkType}`, 'UNSUPPORTED_DEEP_LINK_ERROR');
    this.name = 'UnsupportedDeepLinkError';
  }
}