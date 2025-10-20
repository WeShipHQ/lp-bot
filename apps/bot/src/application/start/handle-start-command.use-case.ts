import { 
  StartCommandExecutedEvent, 
  DeepLinkProcessedEvent, 
  WelcomeMessageSentEvent,
  UserCreationError 
} from '../../domain/start';
import { ParseDeepLinkUseCase, ParseDeepLinkRequest } from './parse-deep-link.use-case';
import { GetWelcomeDataUseCase, GetWelcomeDataRequest } from './get-welcome-data.use-case';
import { RouteDeepLinkUseCase, RouteDeepLinkRequest } from './route-deep-link.use-case';

export interface HandleStartCommandRequest {
  userId: string;
  telegramId: string;
  username?: string;
  walletAddress?: string;
  walletId?: string;
  startParam?: string;
  referralLink?: string;
}

export interface HandleStartCommandResponse {
  shouldEnterScene: boolean;
  sceneId?: string;
  sceneState?: any;
  shouldShowUnsupportedMessage: boolean;
  unsupportedMessage?: string;
  welcomeData?: any;
  events: any[];
}

export interface UserSyncService {
  getUserByTelegramIdOrCreate(userData: {
    id: string;
    telegramId: string;
    username?: string;
    walletAddress?: string;
    walletId?: string;
  }): Promise<any>;
}

export class HandleStartCommandUseCase {
  private events: any[] = [];

  constructor(
    private readonly userSyncService: UserSyncService,
    private readonly parseDeepLinkUseCase: ParseDeepLinkUseCase,
    private readonly getWelcomeDataUseCase: GetWelcomeDataUseCase,
    private readonly routeDeepLinkUseCase: RouteDeepLinkUseCase
  ) {}

  async execute(request: HandleStartCommandRequest): Promise<HandleStartCommandResponse> {
    this.events = [];

    // Emit start command executed event
    this.addEvent(new StartCommandExecutedEvent(
      request.userId,
      request.telegramId,
      !!request.startParam
    ));

    // Handle deep link if present
    if (request.startParam) {
      try {
        const parseResult = await this.parseDeepLinkUseCase.execute({
          startParam: request.startParam
        });

        const routeResult = await this.routeDeepLinkUseCase.execute({
          deepLink: parseResult.deepLink
        });

        this.addEvent(new DeepLinkProcessedEvent(
          request.userId,
          parseResult.deepLink.type,
          parseResult.deepLink.toData(),
          true
        ));

        // If we should enter a scene, return early
        if (routeResult.shouldEnterScene) {
          return {
            shouldEnterScene: true,
            sceneId: routeResult.sceneId,
            sceneState: routeResult.sceneState,
            shouldShowUnsupportedMessage: false,
            events: this.events
          };
        }

        // If we should show unsupported message but continue to welcome
        if (routeResult.shouldShowUnsupportedMessage && routeResult.shouldContinueToWelcome) {
          // Continue to user creation and welcome message
        }

        // If we should show unsupported message and not continue
        if (routeResult.shouldShowUnsupportedMessage && !routeResult.shouldContinueToWelcome) {
          return {
            shouldEnterScene: false,
            shouldShowUnsupportedMessage: true,
            unsupportedMessage: routeResult.unsupportedMessage,
            events: this.events
          };
        }

      } catch (error) {
        console.error('Error processing deep link:', error);
        this.addEvent(new DeepLinkProcessedEvent(
          request.userId,
          'unknown',
          { error: error instanceof Error ? error.message : 'Unknown error' },
          false
        ));
        // Continue to welcome message
      }
    }

    // Create or get user
    const localUser = await this.userSyncService.getUserByTelegramIdOrCreate({
      id: request.userId,
      telegramId: request.telegramId,
      username: request.username,
      walletAddress: request.walletAddress,
      walletId: request.walletId,
    });

    if (!localUser) {
      throw new UserCreationError(request.telegramId);
    }

    // Get welcome data
    const welcomeDataResult = await this.getWelcomeDataUseCase.execute({
      walletAddress: request.walletAddress,
      referralLink: request.referralLink,
    });

    this.addEvent(new WelcomeMessageSentEvent(
      request.userId,
      welcomeDataResult.welcomeData.hasWallet(),
      welcomeDataResult.welcomeData.hasBalance()
    ));

    return {
      shouldEnterScene: false,
      shouldShowUnsupportedMessage: false,
      welcomeData: welcomeDataResult.welcomeData,
      events: this.events
    };
  }

  private addEvent(event: any): void {
    this.events.push(event);
  }

  getEvents(): any[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }
}