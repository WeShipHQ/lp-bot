import { Container } from "inversify";
import {
  ParseDeepLinkUseCase,
  GetWelcomeDataUseCase,
  RouteDeepLinkUseCase,
  HandleStartCommandUseCase,
  SolanaService,
  UserSyncService,
  SceneIds,
} from "@/application/start";
import { solanaService } from "@/services/solana.service";
import { userSyncService } from "@/services/user-sync.service";
import { SCENE_IDS } from "@/presentation/config/scenes";

// Symbols for dependency injection
export const START_TYPES = {
  ParseDeepLinkUseCase: Symbol.for("ParseDeepLinkUseCase"),
  GetWelcomeDataUseCase: Symbol.for("GetWelcomeDataUseCase"),
  RouteDeepLinkUseCase: Symbol.for("RouteDeepLinkUseCase"),
  HandleStartCommandUseCase: Symbol.for("HandleStartCommandUseCase"),
  SolanaService: Symbol.for("SolanaService"),
  UserSyncService: Symbol.for("UserSyncService"),
  SceneIds: Symbol.for("SceneIds"),
};

export function configureStartContainer(container: Container): void {
  // Bind external services
  container
    .bind<SolanaService>(START_TYPES.SolanaService)
    .toConstantValue(solanaService);
  container
    .bind<UserSyncService>(START_TYPES.UserSyncService)
    .toConstantValue(userSyncService);
  container.bind<SceneIds>(START_TYPES.SceneIds).toConstantValue(SCENE_IDS);

  // Bind use cases
  container
    .bind<ParseDeepLinkUseCase>(START_TYPES.ParseDeepLinkUseCase)
    .to(ParseDeepLinkUseCase);

  container
    .bind<GetWelcomeDataUseCase>(START_TYPES.GetWelcomeDataUseCase)
    .toDynamicValue((context) => {
      const solanaService = context.container.get<SolanaService>(
        START_TYPES.SolanaService
      );
      return new GetWelcomeDataUseCase(solanaService);
    });

  container
    .bind<RouteDeepLinkUseCase>(START_TYPES.RouteDeepLinkUseCase)
    .toDynamicValue((context) => {
      const sceneIds = context.container.get<SceneIds>(START_TYPES.SceneIds);
      return new RouteDeepLinkUseCase(sceneIds);
    });

  container
    .bind<HandleStartCommandUseCase>(START_TYPES.HandleStartCommandUseCase)
    .toDynamicValue((context) => {
      const userSyncService = context.container.get<UserSyncService>(
        START_TYPES.UserSyncService
      );
      const parseDeepLinkUseCase = context.container.get<ParseDeepLinkUseCase>(
        START_TYPES.ParseDeepLinkUseCase
      );
      const getWelcomeDataUseCase =
        context.container.get<GetWelcomeDataUseCase>(
          START_TYPES.GetWelcomeDataUseCase
        );
      const routeDeepLinkUseCase = context.container.get<RouteDeepLinkUseCase>(
        START_TYPES.RouteDeepLinkUseCase
      );

      return new HandleStartCommandUseCase(
        userSyncService,
        parseDeepLinkUseCase,
        getWelcomeDataUseCase,
        routeDeepLinkUseCase
      );
    });
}

// Factory function for creating start command dependencies
export function createStartCommandDependencies() {
  return {
    parseDeepLinkUseCase: new ParseDeepLinkUseCase(),
    getWelcomeDataUseCase: new GetWelcomeDataUseCase(solanaService),
    routeDeepLinkUseCase: new RouteDeepLinkUseCase(SCENE_IDS),
    handleStartCommandUseCase: new HandleStartCommandUseCase(
      userSyncService,
      new ParseDeepLinkUseCase(),
      new GetWelcomeDataUseCase(solanaService),
      new RouteDeepLinkUseCase(SCENE_IDS)
    ),
  };
}
