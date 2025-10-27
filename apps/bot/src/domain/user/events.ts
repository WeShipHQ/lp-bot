import { randomUUID } from "node:crypto";
import type {
  PrivyUserId,
  TelegramId,
  UserId,
  UserPreferences,
  WalletAddress,
  WalletId,
} from "./types";

export interface DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly eventType: string;
}

export type DomainEventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => void | Promise<void>;

export type NotificationSettings = Pick<
  UserPreferences,
  "notificationsEnabled" | "priceAlertsEnabled" | "rebalanceAlertsEnabled"
>;

export class UserCreatedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = "UserCreated" as const;

  public readonly preferences: Readonly<UserPreferences>;

  constructor(
    public readonly userId: UserId,
    public readonly telegramId: TelegramId,
    public readonly privyUserId: PrivyUserId,
    public readonly walletId: WalletId,
    public readonly walletAddress: WalletAddress,
    preferences: UserPreferences,
    public readonly username: string | null,
    public readonly referralCode: string | null,
    public readonly referredBy: string | null
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.preferences = Object.freeze({ ...preferences });
  }
}

export class UserPreferencesUpdatedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = "UserPreferencesUpdated" as const;

  public readonly changes: Readonly<Partial<UserPreferences>>;
  public readonly previousPreferences: Readonly<UserPreferences>;
  public readonly currentPreferences: Readonly<UserPreferences>;

  constructor(
    public readonly userId: UserId,
    changes: Partial<UserPreferences>,
    previousPreferences: UserPreferences,
    currentPreferences: UserPreferences
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.changes = Object.freeze({ ...changes });
    this.previousPreferences = Object.freeze({ ...previousPreferences });
    this.currentPreferences = Object.freeze({ ...currentPreferences });
  }
}

export class UserNotificationSettingsChangedEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly occurredAt: Date;
  public readonly eventType = "UserNotificationSettingsChanged" as const;

  public readonly previousSettings: Readonly<NotificationSettings>;
  public readonly currentSettings: Readonly<NotificationSettings>;

  constructor(
    public readonly userId: UserId,
    previousSettings: NotificationSettings,
    currentSettings: NotificationSettings
  ) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.previousSettings = Object.freeze({ ...previousSettings });
    this.currentSettings = Object.freeze({ ...currentSettings });
  }
}

export type UserDomainEvent =
  | UserCreatedEvent
  | UserPreferencesUpdatedEvent
  | UserNotificationSettingsChangedEvent;

export type UserDomainEventType =
  | UserCreatedEvent["eventType"]
  | UserPreferencesUpdatedEvent["eventType"]
  | UserNotificationSettingsChangedEvent["eventType"]
  | "*";

export class UserDomainEvents {
  private static handlers = new Map<UserDomainEventType, DomainEventHandler[]>();

  static subscribe<T extends UserDomainEventType>(
    eventType: T,
    handler: DomainEventHandler
  ): void {
    const handlers = this.handlers.get(eventType) ?? [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  static unsubscribe<T extends UserDomainEventType>(
    eventType: T,
    handler: DomainEventHandler
  ): void {
    const handlers = this.handlers.get(eventType);
    if (!handlers) {
      return;
    }

    this.handlers.set(
      eventType,
      handlers.filter((registered) => registered !== handler)
    );
  }

  static clearHandlers(): void {
    this.handlers.clear();
  }

  static async publish(event: DomainEvent): Promise<void> {
    const specificHandlers =
      this.handlers.get(event.eventType as UserDomainEventType) ?? [];
    const wildcardHandlers = this.handlers.get("*") ?? [];
    const handlers = [...specificHandlers, ...wildcardHandlers];

    for (const handler of handlers) {
      await handler(event);
    }
  }

  static async publishAll(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
