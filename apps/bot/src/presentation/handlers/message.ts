import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { unifiedInputDetectionService } from "@/v2";

export async function messageHandler(
  ctx: BotContext,
  next: () => Promise<void>
) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText) {
    return await next();
  }

  const detection = unifiedInputDetectionService.detectInput(messageText);

  if (!detection) {
    return await next();
  }

  if (detection.type === "token") {
    console.warn("implement token detail scene");
    return ctx.reply("Coming soon...");
  } else if (detection.type === "pool") {
    const { dex, poolType, poolId } = detection;

    return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
      poolAddress: poolId,
      dex,
      poolType,
    });
  }

  return await next();
}
