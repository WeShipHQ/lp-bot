export class StartCommandExecutedEvent {
  constructor(
    public readonly userId: string,
    public readonly telegramId: string,
    public readonly hasDeepLink: boolean,
    public readonly deepLinkType?: string,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class DeepLinkProcessedEvent {
  constructor(
    public readonly userId: string,
    public readonly deepLinkType: string,
    public readonly deepLinkData: any,
    public readonly success: boolean,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class WelcomeMessageSentEvent {
  constructor(
    public readonly userId: string,
    public readonly hasWallet: boolean,
    public readonly hasBalance: boolean,
    public readonly timestamp: Date = new Date()
  ) {}
}