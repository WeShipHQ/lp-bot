export class TokenAmount {
  private constructor(
    private readonly token: string,
    private readonly rawAmount: bigint,
    private readonly decimals: number
  ) {
    if (decimals < 0 || decimals > 18) {
      throw new Error('Token decimals must be between 0 and 18');
    }
  }

  static create(token: string, rawAmount: bigint, decimals: number): TokenAmount {
    return new TokenAmount(token, rawAmount, decimals);
  }

  static fromUi(token: string, uiAmount: number, decimals: number): TokenAmount {
    const rawAmount = BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
    return new TokenAmount(token, rawAmount, decimals);
  }

  static zero(token: string, decimals: number): TokenAmount {
    return new TokenAmount(token, BigInt(0), decimals);
  }

  getToken(): string {
    return this.token;
  }

  getRawAmount(): bigint {
    return this.rawAmount;
  }

  getDecimals(): number {
    return this.decimals;
  }

  toUi(): number {
    return Number(this.rawAmount) / Math.pow(10, this.decimals);
  }

  toUiString(decimals?: number): string {
    const uiAmount = this.toUi();
    const displayDecimals = decimals ?? this.decimals;
    return uiAmount.toFixed(displayDecimals);
  }

  toFormattedString(decimals?: number): string {
    const uiAmount = this.toUi();
    const displayDecimals = decimals ?? Math.min(this.decimals, 4);
    
    return `${uiAmount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: displayDecimals,
    })} ${this.token}`;
  }

  add(other: TokenAmount): TokenAmount {
    this.ensureSameToken(other);
    return new TokenAmount(
      this.token,
      this.rawAmount + other.rawAmount,
      this.decimals
    );
  }

  subtract(other: TokenAmount): TokenAmount {
    this.ensureSameToken(other);
    if (this.rawAmount < other.rawAmount) {
      throw new Error('Cannot subtract to negative token amount');
    }
    return new TokenAmount(
      this.token,
      this.rawAmount - other.rawAmount,
      this.decimals
    );
  }

  greaterThan(other: TokenAmount): boolean {
    this.ensureSameToken(other);
    return this.rawAmount > other.rawAmount;
  }

  lessThan(other: TokenAmount): boolean {
    this.ensureSameToken(other);
    return this.rawAmount < other.rawAmount;
  }

  equals(other: TokenAmount): boolean {
    return (
      this.token === other.token &&
      this.rawAmount === other.rawAmount &&
      this.decimals === other.decimals
    );
  }

  isZero(): boolean {
    return this.rawAmount === BigInt(0);
  }

  private ensureSameToken(other: TokenAmount): void {
    if (this.token !== other.token) {
      throw new Error(`Token mismatch: ${this.token} !== ${other.token}`);
    }
    if (this.decimals !== other.decimals) {
      throw new Error(`Decimals mismatch: ${this.decimals} !== ${other.decimals}`);
    }
  }
}
