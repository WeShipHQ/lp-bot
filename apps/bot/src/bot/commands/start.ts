import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { referralService } from "@/services/referral.service";
import { userSyncService } from "@/services/user-sync.service";
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

      const localUser = await userSyncService.getUserByTelegramIdOrCreate({
        id: ctx.user.id,
        telegramId: ctx.user.telegramId,
        username: ctx.from?.username,
        walletAddress: ctx.user.walletAddress,
        walletId: ctx.user.walletId,
      });

      if (!localUser) {
        await ctx.reply("❌ Error creating user account");
        return;
      }

      const startText =
        ctx.message && "text" in ctx.message ? ctx.message.text : "";
      const referralCode = startText.split(" ")[1];
      let referralMessage = "";

      console.log(`Start command text: "${startText}"`);
      console.log(`Extracted referral code: "${referralCode}"`);

      if (referralCode) {
        console.log(`Processing referral with code: ${referralCode}`);
        const referralProcessed = await referralService.processReferral(
          referralCode,
          ctx.user.telegramId
        );

        if (referralProcessed) {
          referralMessage =
            "\n\n🎉 *Welcome! You've been referred by a friend and earned 50 bonus points!*";
          console.log(
            `Referral processed successfully for user ${ctx.user.telegramId}`
          );
        } else {
          referralMessage = "\n\n⚠️ Invalid or expired referral code";
          console.log(
            `Referral processing failed for user ${ctx.user.telegramId}`
          );
        }
      } else {
        console.log(`No referral code found in start command`);
      }

      const welcomeMessage =
        MessageService.getWelcomeMessage(ctx.user.walletAddress) +
        referralMessage;

      await ctx.reply(welcomeMessage, {
        parse_mode: "Markdown",
        reply_markup: getMainKeyboard(),
      });
    } catch (error) {
      console.error("Error in start command:", error);
      await ctx.reply(MessageService.getErrorMessage());
    }
  });
}
