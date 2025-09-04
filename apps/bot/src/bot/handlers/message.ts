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
    // handle token detail scene
    console.warn("implement token detail scene");
    return ctx.reply("Coming soon...");
  } else if (detection.type.startsWith("meteora")) {
    // handle pool detail scene
    return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
      poolAddress: detection.value,
    });
  }

  return await next();
}
