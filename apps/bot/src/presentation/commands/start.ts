import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { BotContext } from "@/types/bot.types";
import { StartFormatter } from "../formatters/start.formatter";
import { UserCreationError } from "@/domain/start";
import { createStartCommandDependencies } from "@/infrastructure/di/start.container";
import { solanaService } from "@/services/solana.service";

export function startCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  // Initialize dependencies
  const dependencies = createStartCommandDependencies();

  bot.start(async (ctx: BotContext) => {
    try {
      // @ts-expect-error
      const messageText = ctx.message?.text || "";
      const startParam = messageText.split(" ")[1];

      // Initialize use cases
      // const parseDeepLinkUseCase = dependencies.parseDeepLinkUseCase;
      // const getWelcomeDataUseCase = dependencies.getWelcomeDataUseCase;
      // const routeDeepLinkUseCase = dependencies.routeDeepLinkUseCase;
      const handleStartCommandUseCase = dependencies.handleStartCommandUseCase;

      // Execute the start command use case
      const result = await handleStartCommandUseCase.execute({
        userId: ctx.user.id,
        telegramId: ctx.user.telegramId,
        username: ctx.from?.username,
        walletAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
        startParam,
        // TODO: Add referral link logic
        referralLink: undefined,
      });

      // Handle scene navigation
      if (result.shouldEnterScene && result.sceneId && result.sceneState) {
        await ctx.scene.enter(result.sceneId, result.sceneState);
        return;
      }

      // Handle unsupported messages
      if (result.shouldShowUnsupportedMessage && result.unsupportedMessage) {
        await ctx.reply(
          StartFormatter.formatUnsupportedMessage(result.unsupportedMessage)
        );

        // If we shouldn't continue to welcome, return early
        if (!result.welcomeData) {
          return;
        }
      }

      // Handle welcome message
      if (result.welcomeData) {
        let solBalance = 0;
        let solPrice = 0;
        let referralMessage = "";

        // Get fresh balance data for display
        if (ctx.user.walletAddress) {
          try {
            [solBalance, solPrice] = await Promise.all([
              solanaService.getBalance(ctx.user.walletAddress),
              solanaService.getSolPrice(),
            ]);
          } catch (error) {
            console.log("Failed to fetch balance for display:", error);
          }
        }

        const usdValue = solBalance * solPrice;

        const welcomeMessage =
          StartFormatter.formatWelcomeMessageWithBalanceInfo(
            result.welcomeData,
            solBalance,
            usdValue,
            referralMessage
          );

        await ctx.reply(welcomeMessage, {
          parse_mode: "Markdown",
          reply_markup: getMainKeyboard(),
        });
      }
    } catch (error) {
      console.error("Error in start command:", error);

      let errorMessage: string;
      if (error instanceof UserCreationError) {
        errorMessage = StartFormatter.formatErrorMessage("user_creation");
      } else {
        errorMessage = StartFormatter.formatErrorMessage("general");
      }

      await ctx.reply(errorMessage);
    }
  });
}
