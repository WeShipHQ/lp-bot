import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";

export function startCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.start(async (ctx: BotContext) => {
    try {
      // @ts-expect-error
      const messageText = ctx.message?.text || "";
      const startParam = messageText.split(" ")[1];

      if (startParam) {
        if (startParam.startsWith("dlmm_position_")) {
          const positionAddress = startParam.replace(/^dlmm_position_/, "");
          await ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
            positionAddress,
          });
          return;
        }

        if (startParam.startsWith("dlmm_pool_")) {
          const poolAddress = startParam.replace(/^dlmm_pool_/, "");
          await ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
            poolAddress,
          });
          return;
        }
      }

      const welcomeMessage = MessageService.getWelcomeMessage(
        ctx.user.walletAddress!
      );

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: getMainKeyboard().inline_keyboard,
        },
      });
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply(MessageService.getErrorMessage());
    }
  });

}
