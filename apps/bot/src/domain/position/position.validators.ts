import { ValidationError, InvalidAmountError } from '../shared/errors';
import { CreatePositionData } from './position.entity';

export function validateCreateParams(data: Partial<CreatePositionData>): void {
  if (!data.userId) {
    throw new ValidationError('User ID is required');
  }

  if (!data.positionAddress) {
    throw new ValidationError('Position address is required');
  }

  if (!data.poolAddress) {
    throw new ValidationError('Pool address is required');
  }

  validatePoolAddress(data.poolAddress);

  if (!data.dex) {
    throw new ValidationError('DEX type is required');
  }

  if (!data.strategyType) {
    throw new ValidationError('Strategy type is required');
  }

  validateStrategy(data.strategyType);

  if (!data.tokenX || !data.tokenY) {
    throw new ValidationError('Both tokens are required');
  }

  if (!data.initialValueUsd || data.initialValueUsd <= 0) {
    throw new InvalidAmountError('Initial value must be greater than zero');
  }

  validateAmount(data.initialValueUsd);

  if (!data.initialTokenXAmount || !data.initialTokenYAmount) {
    throw new ValidationError('Initial token amounts are required');
  }

  if (!data.initialTokenXPriceUsd || !data.initialTokenYPriceUsd) {
    throw new ValidationError('Initial token prices are required');
  }

  if (data.rebalanceThreshold !== undefined) {
    if (data.rebalanceThreshold < 0 || data.rebalanceThreshold > 100) {
      throw new ValidationError('Rebalance threshold must be between 0 and 100');
    }
  }
}

export function validateAmount(amount: number): void {
  if (!Number.isFinite(amount)) {
    throw new InvalidAmountError('Amount must be a finite number');
  }

  if (amount < 0) {
    throw new InvalidAmountError('Amount cannot be negative');
  }

  if (amount === 0) {
    throw new InvalidAmountError('Amount must be greater than zero');
  }

  const MIN_POSITION_VALUE = 0.01;
  if (amount < MIN_POSITION_VALUE) {
    throw new InvalidAmountError(
      `Amount must be at least $${MIN_POSITION_VALUE}`
    );
  }
}

export function validatePoolAddress(address: string): void {
  if (!address || address.trim().length === 0) {
    throw new ValidationError('Pool address cannot be empty');
  }

  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(address)) {
    throw new ValidationError('Invalid Solana address format');
  }
}

export function validateStrategy(strategy: string): void {
  const validStrategies = ['DLMM', 'DAMM', 'CONCENTRATED'];
  
  if (!validStrategies.includes(strategy)) {
    throw new ValidationError(
      `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`
    );
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

export function validateTokenAddress(address: string): void {
  validateWalletAddress(address);
}

export function validatePercentage(value: number, fieldName: string = 'Value'): void {
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${fieldName} must be a finite number`);
  }

  if (value < 0 || value > 100) {
    throw new ValidationError(`${fieldName} must be between 0 and 100`);
  }
}
