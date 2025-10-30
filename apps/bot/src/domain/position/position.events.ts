import { DexType, StrategyType } from './position.entity';

export interface DomainEvent {
  eventId: string;
  occurredAt: Date;
  eventType: string;
}

export class PositionCreatedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = 'PositionCreated';

  constructor(
    public readonly positionId: string,
    public readonly userId: string,
    public readonly positionAddress: string,
    public readonly poolAddress: string,
    public readonly dex: DexType,
    public readonly strategyType: StrategyType,
    public readonly initialValueUsd: number,
    public readonly transactionSignature?: string
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}

export class PositionClosedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = 'PositionClosed';

  constructor(
    public readonly positionId: string,
    public readonly userId: string,
    public readonly positionAddress: string,
    public readonly finalValueUsd: number,
    public readonly pnlUsd: number,
    public readonly pnlPercentage: number,
    public readonly transactionSignature?: string
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}

export class FeesClaimedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = 'FeesClaimed';

  constructor(
    public readonly positionId: string,
    public readonly userId: string,
    public readonly positionAddress: string,
    public readonly claimedAmountUsd: number,
    public readonly totalFeesClaimedUsd: number,
    public readonly transactionSignature?: string
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}

export class PositionRebalancedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = 'PositionRebalanced';

  constructor(
    public readonly positionId: string,
    public readonly userId: string,
    public readonly oldPositionAddress: string,
    public readonly newPositionAddress: string,
    public readonly reason: string,
    public readonly oldValueUsd: number,
    public readonly newValueUsd: number,
    public readonly transactionSignature?: string
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}

export class PositionValueUpdatedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = 'PositionValueUpdated';

  constructor(
    public readonly positionId: string,
    public readonly positionAddress: string,
    public readonly oldValueUsd: number,
    public readonly newValueUsd: number,
    public readonly pnlUsd: number,
    public readonly pnlPercentage: number
  ) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
  }
}
