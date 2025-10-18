import { Money } from './money';

export class PnL {
  private constructor(
    private readonly absolute: Money,
    private readonly percentage: number
  ) {
    if (!Number.isFinite(percentage)) {
      throw new Error('PnL percentage must be a finite number');
    }
  }

  static create(absolute: Money, percentage: number): PnL {
    return new PnL(absolute, percentage);
  }

  static fromValues(initial: Money, current: Money): PnL {
    const absoluteDiff = current.toNumber() - initial.toNumber();
    const absolute = Money.usd(Math.abs(absoluteDiff));
    
    const percentage = initial.toNumber() === 0 
      ? 0 
      : (absoluteDiff / initial.toNumber()) * 100;
    
    return new PnL(
      absoluteDiff >= 0 ? absolute : Money.usd(absoluteDiff),
      percentage
    );
  }

  static zero(): PnL {
    return new PnL(Money.zero(), 0);
  }

  isPositive(): boolean {
    return this.percentage > 0;
  }

  isNegative(): boolean {
    return this.percentage < 0;
  }

  isBreakEven(): boolean {
    return this.percentage === 0;
  }

  getAbsolute(): Money {
    return this.absolute;
  }

  getPercentage(): number {
    return this.percentage;
  }

  toString(): string {
    const sign = this.isPositive() ? '+' : '';
    return `${sign}${this.absolute.toFormattedString(2)} (${sign}${this.percentage.toFixed(2)}%)`;
  }

  toFormattedString(includeSign: boolean = true): string {
    const sign = includeSign && this.isPositive() ? '+' : '';
    const emoji = this.isPositive() ? '📈' : this.isNegative() ? '📉' : '➖';
    
    return `${emoji} ${sign}${this.absolute.toFormattedString(2)} (${sign}${this.percentage.toFixed(2)}%)`;
  }

  toShortString(): string {
    const sign = this.isPositive() ? '+' : '';
    return `${sign}${this.percentage.toFixed(2)}%`;
  }
}
