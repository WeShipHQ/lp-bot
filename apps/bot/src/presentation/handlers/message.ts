import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { ParseFreeTextMessageUseCase } from "@/application/message/parse-free-text.use-case";
import { RouteFreeTextMessageUseCase } from "@/application/message/route-free-text.use-case";
import { container, DI_TOKENS } from "@/infrastructure/di/container";
import { MessageService } from "@/application/message/message.service";
import { createTextMessage } from "../formatters/message-builder";

export async function messageHandler(
  ctx: BotContext,
  next: () => Promise<void>
) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText || !messageText.trim()) {
    return await next();
  }

  const parsed = container
    .get(ParseFreeTextMessageUseCase)
    .execute({ text: messageText });

  const decision = container.get(RouteFreeTextMessageUseCase).execute(parsed);

  if (decision.type === "enter_pool_detail") {
    const { poolAddress, dex, poolType } = decision.state;
    return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
      poolAddress,
      dex,
      poolType,
    });
  }

  const chatId = ctx.chat?.id;
  if (!chatId) {
    return await next();
  }

  const messageService = container.get<MessageService>(
    DI_TOKENS.MessageService
  );

  if (decision.type === "unsupported_pool_type") {
    await messageService.send({
      context: { chatId },
      payload: createTextMessage(
        "message.unsupported_pool",
        "❌ Pool type not supported yet. Currently we support Meteora DLMM pools only.",
        { disableLinkPreview: true }
      ),
    });
    return;
  }

  if (decision.type === "token_search_unavailable") {
    await messageService.send({
      context: { chatId },
      payload: createTextMessage(
        "message.token_unavailable",
        "🚧 Token details are coming soon. Paste this address when opening a position to proceed.",
        { disableLinkPreview: true }
      ),
    });
    return;
  }

  return await next();
}
