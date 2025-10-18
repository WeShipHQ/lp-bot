import { Money, PnL, TokenAmount, Range } from '../shared/value-objects';
import { InvalidStateError, InvalidAmountError } from '../shared/errors';

export type PositionStatus = 'ACTIVE' | 'CLOSED' | 'REBALANCING';
export type DexType = 'meteora' | 'saros' | 'orca' | 'raydium';
export type StrategyType = 'DLMM' | 'DAMM' | 'CONCENTRATED';

export interface PositionToken {
  address: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

export interface CreatePositionData {
  userId: string;
  positionAddress: string;
  poolAddress: string;
  dex: DexType;
  strategyType: StrategyType;
  tokenX: PositionToken;
  tokenY: PositionToken;
  initialValueUsd: number;
  initialTokenXAmount: string;
  initialTokenYAmount: string;
  initialTokenXPriceUsd: number;
  initialTokenYPriceUsd: number;
  priceRange?: Range;
  isRebalancingEnabled?: boolean;
  rebalanceThreshold?: number;
}

export class Position {
  private domainEvents: any[] = [];

  private constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly positionAddress: string,
    public readonly poolAddress: string,
    public readonly dex: DexType,
    public readonly strategyType: StrategyType,
    public readonly tokenX: PositionToken,
    public readonly tokenY: PositionToken,
    private status: PositionStatus,
    private readonly initialValue: Money,
    private currentValue: Money,
    private readonly initialTokenXAmount: TokenAmount,
    private readonly initialTokenYAmount: TokenAmount,
    private currentTokenXAmount: TokenAmount,
    private currentTokenYAmount: TokenAmount,
    private claimedFees: Money,
    private priceRange: Range | null,
    private readonly isRebalancingEnabled: boolean,
    private readonly rebalanceThreshold: number,
    public readonly createdAt: Date,
    private updatedAt: Date,
    private closedAt?: Date,
    private transactionSignature?: string
  ) {}

  static create(data: CreatePositionData): Position {
    const initialValue = Money.usd(data.initialValueUsd);
    const currentValue = Money.usd(data.initialValueUsd);
    
    const initialTokenXAmount = TokenAmount.fromUi(
      data.tokenX.symbol,
      parseFloat(data.initialTokenXAmount),
      data.tokenX.decimals
    );
    
    const initialTokenYAmount = TokenAmount.fromUi(
      data.tokenY.symbol,
      parseFloat(data.initialTokenYAmount),
      data.tokenY.decimals
    );

    const now = new Date();

    const position = new Position(
      crypto.randomUUID(),
      data.userId,
      data.positionAddress,
      data.poolAddress,
      data.dex,
      data.strategyType,
      data.tokenX,
      data.tokenY,
      'ACTIVE',
      initialValue,
      currentValue,
      initialTokenXAmount,
      initialTokenYAmount,
      initialTokenXAmount,
      initialTokenYAmount,
      Money.zero(),
      data.priceRange ?? null,
      data.isRebalancingEnabled ?? false,
      data.rebalanceThreshold ?? 20,
      now,
      now
    );

    return position;
  }

  static reconstitute(data: {
    id: string;
    userId: string;
    positionAddress: string;
    poolAddress: string;
    dex: DexType;
    strategyType: StrategyType;
    tokenX: PositionToken;
    tokenY: PositionToken;
    status: PositionStatus;
    initialValueUsd: number;
    currentValueUsd: number;
    initialTokenXAmount: string;
    initialTokenYAmount: string;
    currentTokenXAmount: string;
    currentTokenYAmount: string;
    claimedFeesUsd: number;
    priceRange?: { min: number; max: number } | null;
    isRebalancingEnabled: boolean;
    rebalanceThreshold: number;
    createdAt: Date;
    updatedAt: Date;
    closedAt?: Date;
    transactionSignature?: string;
  }): Position {
    const initialTokenXAmount = TokenAmount.fromUi(
      data.tokenX.symbol,
      parseFloat(data.initialTokenXAmount),
      data.tokenX.decimals
    );
    
    const initialTokenYAmount = TokenAmount.fromUi(
      data.tokenY.symbol,
      parseFloat(data.initialTokenYAmount),
      data.tokenY.decimals
    );

    const currentTokenXAmount = TokenAmount.fromUi(
      data.tokenX.symbol,
      parseFloat(data.currentTokenXAmount),
      data.tokenX.decimals
    );
    
    const currentTokenYAmount = TokenAmount.fromUi(
      data.tokenY.symbol,
      parseFloat(data.currentTokenYAmount),
      data.tokenY.decimals
    );

    const priceRange = data.priceRange 
      ? Range.create(data.priceRange.min, data.priceRange.max)
      : null;

    return new Position(
      data.id,
      data.userId,
      data.positionAddress,
      data.poolAddress,
      data.dex,
      data.strategyType,
      data.tokenX,
      data.tokenY,
      data.status,
      Money.usd(data.initialValueUsd),
      Money.usd(data.currentValueUsd),
      initialTokenXAmount,
      initialTokenYAmount,
      currentTokenXAmount,
      currentTokenYAmount,
      Money.usd(data.claimedFeesUsd),
      priceRange,
      data.isRebalancingEnabled,
      data.rebalanceThreshold,
      data.createdAt,
      data.updatedAt,
      data.closedAt,
      data.transactionSignature
    );
  }

  calculatePnL(): PnL {
    return PnL.fromValues(this.initialValue, this.currentValue);
  }

  calculateTotalPnLWithFees(): PnL {
    const totalValue = this.currentValue.add(this.claimedFees);
    return PnL.fromValues(this.initialValue, totalValue);
  }

  canClaim(): boolean {
    return this.status === 'ACTIVE';
  }

  shouldRebalance(currentPrice: number): boolean {
    if (!this.isRebalancingEnabled) {
      return false;
    }

    if (!this.priceRange) {
      return false;
    }

    if (this.status !== 'ACTIVE') {
      return false;
    }

    const deviation = this.priceRange.calculateDeviationFromBounds(currentPrice);
    return Math.abs(deviation) >= this.rebalanceThreshold;
  }

  priceDeviation(currentPrice: number): number {
    if (!this.priceRange) {
      return 0;
    }

    return this.priceRange.calculateDeviation(currentPrice);
  }

  isInRange(currentPrice: number): boolean {
    if (!this.priceRange) {
      return true;
    }

    return this.priceRange.contains(currentPrice);
  }

  close(): void {
    if (this.status === 'CLOSED') {
      throw new InvalidStateError('Position is already closed');
    }

    this.status = 'CLOSED';
    this.closedAt = new Date();
    this.updatedAt = new Date();
  }

  updateCurrentValue(value: Money): void {
    if (this.status === 'CLOSED') {
      throw new InvalidStateError('Cannot update value of closed position');
    }

    if (value.lessThan(Money.zero())) {
      throw new InvalidAmountError('Position value cannot be negative');
    }

    this.currentValue = value;
    this.updatedAt = new Date();
  }

  updateTokenAmounts(tokenXAmount: TokenAmount, tokenYAmount: TokenAmount): void {
    if (this.status === 'CLOSED') {
      throw new InvalidStateError('Cannot update token amounts of closed position');
    }

    this.currentTokenXAmount = tokenXAmount;
    this.currentTokenYAmount = tokenYAmount;
    this.updatedAt = new Date();
  }

  addClaimedFees(amount: Money): void {
    if (this.status === 'CLOSED') {
      throw new InvalidStateError('Cannot claim fees for closed position');
    }

    if (amount.lessThan(Money.zero())) {
      throw new InvalidAmountError('Claimed fees amount cannot be negative');
    }

    this.claimedFees = this.claimedFees.add(amount);
    this.updatedAt = new Date();
  }

  setTransactionSignature(signature: string): void {
    if (!signature || signature.trim().length === 0) {
      throw new InvalidAmountError('Transaction signature cannot be empty');
    }

    this.transactionSignature = signature;
    this.updatedAt = new Date();
  }

  updatePriceRange(range: Range): void {
    if (this.status === 'CLOSED') {
      throw new InvalidStateError('Cannot update price range of closed position');
    }

    this.priceRange = range;
    this.updatedAt = new Date();
  }

  startRebalancing(): void {
    if (this.status !== 'ACTIVE') {
      throw new InvalidStateError('Can only rebalance active positions');
    }

    this.status = 'REBALANCING';
    this.updatedAt = new Date();
  }

  completeRebalancing(): void {
    if (this.status !== 'REBALANCING') {
      throw new InvalidStateError('Position is not in rebalancing state');
    }

    this.status = 'ACTIVE';
    this.updatedAt = new Date();
  }

  getStatus(): PositionStatus {
    return this.status;
  }

  getCurrentValue(): Money {
    return this.currentValue;
  }

  getInitialValue(): Money {
    return this.initialValue;
  }

  getClaimedFees(): Money {
    return this.claimedFees;
  }

  getCurrentTokenXAmount(): TokenAmount {
    return this.currentTokenXAmount;
  }

  getCurrentTokenYAmount(): TokenAmount {
    return this.currentTokenYAmount;
  }

  getInitialTokenXAmount(): TokenAmount {
    return this.initialTokenXAmount;
  }

  getInitialTokenYAmount(): TokenAmount {
    return this.initialTokenYAmount;
  }

  getPriceRange(): Range | null {
    return this.priceRange;
  }

  getTransactionSignature(): string | undefined {
    return this.transactionSignature;
  }

  getClosedAt(): Date | undefined {
    return this.closedAt;
  }

  getUpdatedAt(): Date {
    return this.updatedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  isClosed(): boolean {
    return this.status === 'CLOSED';
  }

  isRebalancing(): boolean {
    return this.status === 'REBALANCING';
  }

  addEvent(event: any): void {
    this.domainEvents.push(event);
  }

  getEvents(): any[] {
    return [...this.domainEvents];
  }

  clearEvents(): void {
    this.domainEvents = [];
  }
}
