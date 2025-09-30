import { inputDetectionService } from "../../services/input-detection.service";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";

export async function messageHandler(
  ctx: BotContext,
  next: () => Promise<void>
) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText) {
    return await next();
  }

  const detection = inputDetectionService.detectInput(messageText);

  if (!detection) {
    return await next();
  }

  if (detection.type === "address") {
    console.warn("implement token detail scene");
    return ctx.reply("Coming soon...");
  } else if (detection.type === "pool") {
    const { dex, poolType, value } = detection;

    return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
      poolAddress: value,
      dex,
      poolType,
    });
  }

  return await next();
}
