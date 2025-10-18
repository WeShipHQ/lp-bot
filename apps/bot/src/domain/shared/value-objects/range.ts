export class Range {
  private constructor(
    private readonly min: number,
    private readonly max: number
  ) {
    if (min > max) {
      throw new Error('Range min cannot be greater than max');
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error('Range values must be finite numbers');
    }
    if (min < 0 || max < 0) {
      throw new Error('Range values cannot be negative');
    }
  }

  static create(min: number, max: number): Range {
    return new Range(min, max);
  }

  static fromPercentage(center: number, percentage: number): Range {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Percentage must be between 0 and 100');
    }
    
    const deviation = (center * percentage) / 100;
    const min = Math.max(0, center - deviation);
    const max = center + deviation;
    
    return new Range(min, max);
  }

  getMin(): number {
    return this.min;
  }

  getMax(): number {
    return this.max;
  }

  getCenter(): number {
    return (this.min + this.max) / 2;
  }

  getWidth(): number {
    return this.max - this.min;
  }

  contains(value: number): boolean {
    return value >= this.min && value <= this.max;
  }

  isInRange(value: number): boolean {
    return this.contains(value);
  }

  calculateDeviation(value: number): number {
    const center = this.getCenter();
    if (center === 0) return 0;
    
    return ((value - center) / center) * 100;
  }

  calculateDeviationFromBounds(value: number): number {
    if (this.contains(value)) {
      return 0;
    }
    
    if (value < this.min) {
      return ((this.min - value) / this.min) * 100;
    }
    
    return ((value - this.max) / this.max) * 100;
  }

  isAboveRange(value: number): boolean {
    return value > this.max;
  }

  isBelowRange(value: number): boolean {
    return value < this.min;
  }

  toString(): string {
    return `${this.min.toFixed(2)} - ${this.max.toFixed(2)}`;
  }

  toFormattedString(decimals: number = 2): string {
    return `${this.min.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} - ${this.max.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  }

  equals(other: Range): boolean {
    return this.min === other.min && this.max === other.max;
  }
}
