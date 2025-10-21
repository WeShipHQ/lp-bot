import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";
import { StartFormatter } from "../formatters/start.formatter";
import { UserCreationError } from "@/domain/start";
import { createStartCommandDependencies } from "@/infrastructure/di/start.container";
import { solanaService } from "@/services/solana.service";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { MessageService } from "@/application/message/message.service";

export function startCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  // Initialize dependencies
  const dependencies = createStartCommandDependencies();

  bot.start(async (ctx: BotContext) => {
    try {
      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      const messageService = container.get<MessageService>(
        DI_TOKENS.MessageService
      );

      // @ts-expect-error
      const messageText = ctx.message?.text || "";
      const startParam = messageText.split(" ")[1];

      const handleStartCommandUseCase = dependencies.handleStartCommandUseCase;

      const result = await handleStartCommandUseCase.execute({
        userId: ctx.user.id,
        telegramId: ctx.user.telegramId,
        username: ctx.from?.username,
        walletAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
        startParam,
        referralLink: undefined,
      });

      if (result.shouldEnterScene && result.sceneId && result.sceneState) {
        await ctx.scene.enter(result.sceneId, result.sceneState);
        return;
      }

      if (result.shouldShowUnsupportedMessage && result.unsupportedMessage) {
        const unsupportedPayload = StartFormatter.unsupported(
          result.unsupportedMessage
        );
        await messageService.send({
          context: { chatId },
          payload: unsupportedPayload,
        });

        if (!result.welcomeData) {
          return;
        }
      }

      if (result.welcomeData) {
        let solBalance = 0;
        let solPrice = 0;
        let referralMessage = "";

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

        const welcomePayload = StartFormatter.welcomeWithBalance(
          result.welcomeData,
          solBalance,
          usdValue,
          referralMessage
        );

        await messageService.send({
          context: { chatId },
          payload: welcomePayload,
        });
      }
    } catch (error) {
      console.error("Error in start command:", error);

      const chatId = ctx.chat?.id;
      if (!chatId) {
        return;
      }

      const messageService = container.get<MessageService>(
        DI_TOKENS.MessageService
      );

      const errorPayload = error instanceof UserCreationError
        ? StartFormatter.error("user_creation")
        : StartFormatter.error("general");

      await messageService.send({
        context: { chatId },
        payload: errorPayload,
      });
    }
  });
}
