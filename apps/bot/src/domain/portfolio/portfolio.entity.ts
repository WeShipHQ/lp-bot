import { Position, DexType } from '../position/position.entity';
import { Money, PnL, DexMetrics } from '../shared/value-objects';

/**
 * Portfolio aggregate root.
 * Encapsulates a collection of Position entities with helpers to compute totals,
 * breakdowns and derived metrics (PnL, fees, active/closed counts, etc.).
 */
export class Portfolio {
  private constructor(
    public readonly userId: string,
    private readonly positions: Position[],
    private readonly calculatedAt: Date
  ) {}

  static create(userId: string, positions: Position[]): Portfolio {
    return new Portfolio(userId, positions, new Date());
  }

  calculateTotalValue(): Money {
    if (this.positions.length === 0) {
      return Money.zero();
    }

    return this.positions.reduce(
      (total, position) => total.add(position.getCurrentValue()),
      Money.zero()
    );
  }

  calculateTotalPnL(): PnL {
    if (this.positions.length === 0) {
      return PnL.zero();
    }

    const totalInitialValue = this.positions.reduce(
      (sum, position) => sum + position.getInitialValue().toNumber(),
      0
    );

    const totalCurrentValue = this.positions.reduce(
      (sum, position) => sum + position.getCurrentValue().toNumber(),
      0
    );

    return PnL.fromValues(
      Money.usd(totalInitialValue),
      Money.usd(totalCurrentValue)
    );
  }

  calculateTotalPnLWithFees(): PnL {
    if (this.positions.length === 0) {
      return PnL.zero();
    }

    const totalInitialValue = this.positions.reduce(
      (sum, position) => sum + position.getInitialValue().toNumber(),
      0
    );

    const totalCurrentValue = this.positions.reduce(
      (sum, position) => {
        const currentValue = position.getCurrentValue().toNumber();
        const claimedFees = position.getClaimedFees().toNumber();
        return sum + currentValue + claimedFees;
      },
      0
    );

    return PnL.fromValues(
      Money.usd(totalInitialValue),
      Money.usd(totalCurrentValue)
    );
  }

  calculateTotalFeesEarned(): Money {
    if (this.positions.length === 0) {
      return Money.zero();
    }

    return this.positions.reduce(
      (total, position) => total.add(position.getClaimedFees()),
      Money.zero()
    );
  }

  getDexBreakdown(): Map<DexType, DexMetrics> {
    const breakdown = new Map<DexType, DexMetrics>();

    for (const position of this.positions) {
      const dex = position.dex;
      const currentMetrics = breakdown.get(dex) || DexMetrics.empty();
      
      const positionValue = position.getCurrentValue();
      const positionPnL = position.calculatePnL();
      
      const newMetrics = DexMetrics.create(
        currentMetrics.getPositionsCount() + 1,
        currentMetrics.getTotalValue().add(positionValue),
        PnL.create(
          currentMetrics.getTotalPnL().getAbsolute().add(positionPnL.getAbsolute()),
          currentMetrics.getTotalPnL().getPercentage() + positionPnL.getPercentage()
        )
      );
      
      breakdown.set(dex, newMetrics);
    }

    return breakdown;
  }

  getTopPerformers(limit: number = 5): Position[] {
    return [...this.positions]
      .sort((a, b) => {
        const aPnL = a.calculatePnL().getPercentage();
        const bPnL = b.calculatePnL().getPercentage();
        return bPnL - aPnL;
      })
      .slice(0, limit);
  }

  getWorstPerformers(limit: number = 5): Position[] {
    return [...this.positions]
      .sort((a, b) => {
        const aPnL = a.calculatePnL().getPercentage();
        const bPnL = b.calculatePnL().getPercentage();
        return aPnL - bPnL;
      })
      .slice(0, limit);
  }

  needsRebalancing(threshold: number): Position[] {
    return this.positions.filter(position => {
      if (!position.isActive()) {
        return false;
      }

      const priceRange = position.getPriceRange();
      if (!priceRange) {
        return false;
      }

      return false;
    });
  }

  getActivePositions(): Position[] {
    return this.positions.filter(p => p.isActive());
  }

  getClosedPositions(): Position[] {
    return this.positions.filter(p => p.isClosed());
  }

  getPositionsByDex(dex: DexType): Position[] {
    return this.positions.filter(p => p.dex === dex);
  }

  getPositions(): Position[] {
    return [...this.positions];
  }

  getPositionCount(): number {
    return this.positions.length;
  }

  getActivePositionCount(): number {
    return this.getActivePositions().length;
  }

  getCalculatedAt(): Date {
    return this.calculatedAt;
  }

  isEmpty(): boolean {
    return this.positions.length === 0;
  }

  hasActivePositions(): boolean {
    return this.getActivePositions().length > 0;
  }
}
