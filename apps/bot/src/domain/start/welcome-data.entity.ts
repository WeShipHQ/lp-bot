import { Money } from '../shared/value-objects';
import { ValidationError } from '../shared/errors';

export class InvalidWalletAddressError extends ValidationError {
  constructor(address: string) {
    super(`Invalid wallet address: ${address}`, 'INVALID_WALLET_ADDRESS');
    this.name = 'InvalidWalletAddressError';
  }
}

export class WelcomeData {
  private constructor(
    public readonly walletAddress?: string,
    public readonly solBalance?: Money,
    public readonly referralLink?: string,
    public readonly isWalletCreating: boolean = false
  ) {}

  static create(data: {
    walletAddress?: string;
    solBalance?: number;
    solPrice?: number;
    referralLink?: string;
    isWalletCreating?: boolean;
  }): WelcomeData {
    // Validate wallet address if provided
    if (data.walletAddress && !WelcomeData.isValidSolanaAddress(data.walletAddress)) {
      throw new InvalidWalletAddressError(data.walletAddress);
    }

    // Create Money object for SOL balance if both balance and price are provided
    let solBalance: Money | undefined;
    if (data.solBalance !== undefined && data.solPrice !== undefined) {
      const usdValue = data.solBalance * data.solPrice;
      solBalance = Money.usd(usdValue);
    }

    return new WelcomeData(
      data.walletAddress,
      solBalance,
      data.referralLink,
      data.isWalletCreating ?? false
    );
  }

  static createWalletCreating(): WelcomeData {
    return new WelcomeData(undefined, undefined, undefined, true);
  }

  private static isValidSolanaAddress(address: string): boolean {
    // Basic Solana address validation (44 characters, base58)
    if (address.length !== 44) return false;
    
    // Check if it contains only valid base58 characters
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
  }

  hasWallet(): boolean {
    return !!this.walletAddress;
  }

  hasBalance(): boolean {
    return !!this.solBalance;
  }

  hasReferralLink(): boolean {
    return !!this.referralLink && this.referralLink.trim() !== '';
  }

  isCreatingWallet(): boolean {
    return this.isWalletCreating;
  }

  getUsdValue(): number {
    return this.solBalance?.toNumber() ?? 0;
  }

  getSolBalanceFromUsd(solPrice: number): number {
    if (!this.solBalance || solPrice <= 0) return 0;
    return this.solBalance.toNumber() / solPrice;
  }
}