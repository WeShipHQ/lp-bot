import { ValidationError } from '../shared/errors';

export function validateTelegramId(telegramId: string): void {
  if (!telegramId || telegramId.trim().length === 0) {
    throw new ValidationError('Telegram ID cannot be empty');
  }

  if (!/^\d+$/.test(telegramId)) {
    throw new ValidationError('Telegram ID must contain only digits');
  }

  const MIN_TELEGRAM_ID = 1;
  const MAX_TELEGRAM_ID = 9999999999;
  const id = parseInt(telegramId, 10);

  if (id < MIN_TELEGRAM_ID || id > MAX_TELEGRAM_ID) {
    throw new ValidationError('Invalid Telegram ID range');
  }
}

export function validateWalletAddress(address: string): void {
  if (!address || address.trim().length === 0) {
    throw new ValidationError('Wallet address cannot be empty');
  }

  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(address)) {
    throw new ValidationError('Invalid Solana wallet address format');
  }
}

export function validateWalletId(walletId: string): void {
  if (!walletId || walletId.trim().length === 0) {
    throw new ValidationError('Wallet ID cannot be empty');
  }
}

export function validateUsername(username: string): void {
  if (!username || username.trim().length === 0) {
    throw new ValidationError('Username cannot be empty');
  }

  if (username.length > 32) {
    throw new ValidationError('Username cannot exceed 32 characters');
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new ValidationError('Username can only contain letters, numbers, and underscores');
  }
}
