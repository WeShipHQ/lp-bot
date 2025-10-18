import { Money } from './money';
import { PnL } from './pnl';

export class DexMetrics {
  private constructor(
    private readonly positionsCount: number,
    private readonly totalValue: Money,
    private readonly totalPnL: PnL
  ) {
    if (positionsCount < 0) {
      throw new Error('Positions count cannot be negative');
    }
  }

  static create(positionsCount: number, totalValue: Money, totalPnL: PnL): DexMetrics {
    return new DexMetrics(positionsCount, totalValue, totalPnL);
  }

  static empty(): DexMetrics {
    return new DexMetrics(0, Money.zero(), PnL.zero());
  }

  add(other: DexMetrics): DexMetrics {
    const newCount = this.positionsCount + other.positionsCount;
    const newValue = this.totalValue.add(other.totalValue);
    
    const combinedAbsolute = this.totalPnL.getAbsolute().toNumber() + 
                            other.totalPnL.getAbsolute().toNumber();
    
    const totalInitialValue = this.totalValue.toNumber() - this.totalPnL.getAbsolute().toNumber() +
                             other.totalValue.toNumber() - other.totalPnL.getAbsolute().toNumber();
    
    const newPercentage = totalInitialValue === 0 
      ? 0 
      : (combinedAbsolute / totalInitialValue) * 100;
    
    const newPnL = PnL.create(Money.usd(Math.abs(combinedAbsolute)), newPercentage);
    
    return new DexMetrics(newCount, newValue, newPnL);
  }

  getPositionsCount(): number {
    return this.positionsCount;
  }

  getTotalValue(): Money {
    return this.totalValue;
  }

  getTotalPnL(): PnL {
    return this.totalPnL;
  }

  getAverageValue(): Money {
    if (this.positionsCount === 0) {
      return Money.zero();
    }
    return this.totalValue.divide(this.positionsCount);
  }

  hasPositions(): boolean {
    return this.positionsCount > 0;
  }

  toString(): string {
    return `Positions: ${this.positionsCount}, Value: ${this.totalValue.toFormattedString()}, PnL: ${this.totalPnL.toString()}`;
  }
}
