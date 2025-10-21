import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { ParseFreeTextMessageUseCase } from "@/application/message/parse-free-text.use-case";
import { RouteFreeTextMessageUseCase } from "@/application/message/route-free-text.use-case";
import { container } from "@/infrastructure/di/container";

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
  console.log("parsed", parsed);
  const decision = container.get(RouteFreeTextMessageUseCase).execute(parsed);
  console.log("decision", decision);

  if (decision.type === "enter_pool_detail") {
    const { poolAddress, dex, poolType } = decision.state;
    return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
      poolAddress,
      dex,
      poolType,
    });
  }

  if (decision.type === "reply") {
    return ctx.reply(decision.message);
  }

  return await next();
}
