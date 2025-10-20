import { DeepLink, UnsupportedDeepLinkError } from '../../domain/start';

export interface RouteDeepLinkRequest {
  deepLink: DeepLink;
}

export interface RouteDeepLinkResponse {
  shouldEnterScene: boolean;
  sceneId?: string;
  sceneState?: any;
  shouldShowUnsupportedMessage: boolean;
  unsupportedMessage?: string;
  shouldContinueToWelcome: boolean;
}

export interface SceneIds {
  POSITION_DETAIL_SCENE: string;
  POOL_DETAIL_SCENE: string;
}

export class RouteDeepLinkUseCase {
  constructor(
    private readonly sceneIds: SceneIds
  ) {}

  async execute(request: RouteDeepLinkRequest): Promise<RouteDeepLinkResponse> {
    const { deepLink } = request;

    console.log(`Processing deep link:`, deepLink.toData());

    switch (deepLink.type) {
      case "legacy_position":
        console.log(`Navigating to legacy position: ${deepLink.positionAddress}`);
        return {
          shouldEnterScene: true,
          sceneId: this.sceneIds.POSITION_DETAIL_SCENE,
          sceneState: {
            positionAddress: deepLink.positionAddress,
          },
          shouldShowUnsupportedMessage: false,
          shouldContinueToWelcome: false,
        };

      case "legacy_pool":
        console.log(`Navigating to legacy pool: ${deepLink.poolAddress}`);
        return {
          shouldEnterScene: true,
          sceneId: this.sceneIds.POOL_DETAIL_SCENE,
          sceneState: {
            poolAddress: deepLink.poolAddress,
          },
          shouldShowUnsupportedMessage: false,
          shouldContinueToWelcome: false,
        };

      case "token_detail":
        console.log(
          `Token detail requested for: ${deepLink.tokenAddress} with referral: ${deepLink.referralCode}`
        );
        return {
          shouldEnterScene: false,
          shouldShowUnsupportedMessage: true,
          unsupportedMessage: "🚧 Token detail view is coming soon...\n\nFor now, you can paste the token address in chat to get basic information.",
          shouldContinueToWelcome: true,
        };

      case "pool_detail":
        console.log(
          `Pool detail requested for: ${deepLink.poolAddress} on ${deepLink.dexCode} with referral: ${deepLink.referralCode}`
        );
        if (deepLink.isSupportedDex()) {
          return {
            shouldEnterScene: true,
            sceneId: this.sceneIds.POOL_DETAIL_SCENE,
            sceneState: {
              poolAddress: deepLink.poolAddress,
              dex: deepLink.dexCode,
            },
            shouldShowUnsupportedMessage: false,
            shouldContinueToWelcome: false,
          };
        } else {
          return {
            shouldEnterScene: false,
            shouldShowUnsupportedMessage: true,
            unsupportedMessage: `❌ Unsupported DEX: ${deepLink.dexCode}\n\nWe currently support: meteora, saros`,
            shouldContinueToWelcome: true,
          };
        }

      case "position_detail":
        console.log(
          `Position detail requested for: ${deepLink.positionAddress} on ${deepLink.dexCode} with referral: ${deepLink.referralCode}`
        );
        if (deepLink.isSupportedDex()) {
          return {
            shouldEnterScene: true,
            sceneId: this.sceneIds.POSITION_DETAIL_SCENE,
            sceneState: {
              positionAddress: deepLink.positionAddress,
            },
            shouldShowUnsupportedMessage: false,
            shouldContinueToWelcome: false,
          };
        } else {
          return {
            shouldEnterScene: false,
            shouldShowUnsupportedMessage: true,
            unsupportedMessage: `❌ Unsupported DEX: ${deepLink.dexCode}\n\nWe currently support: meteora, saros`,
            shouldContinueToWelcome: true,
          };
        }

      case "referral":
        console.log(`Referral code detected: ${deepLink.referralCode}`);
        return {
          shouldEnterScene: false,
          shouldShowUnsupportedMessage: false,
          shouldContinueToWelcome: true,
        };

      default:
        throw new UnsupportedDeepLinkError(deepLink.type);
    }
  }
}