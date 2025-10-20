import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { getMainKeyboard } from "../keyboards/main-menu";
import { MessageService } from "@/services/message.service";
import { referralService } from "@/services/referral.service";
import { userSyncService } from "@/services/user-sync.service";
import { solanaService } from "@/services/solana.service";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageManager } from "@/bot/utils/messages";
import { parseDeepLinkParam } from "@/bot/utils/misc";

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
        const parsed = parseDeepLinkParam(startParam);
        console.log(`Parsed deep link:`, parsed);

        switch (parsed.type) {
          case "legacy_position":
            console.log(
              `Navigating to legacy position: ${parsed.positionAddress}`
            );
            await ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
              positionAddress: parsed.positionAddress,
            });
            return;

          case "legacy_pool":
            console.log(`Navigating to legacy pool: ${parsed.poolAddress}`);
            await ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
              poolAddress: parsed.poolAddress,
            });
            return;

          case "token_detail":
            console.log(
              `Token detail requested for: ${parsed.tokenAddress} with referral: ${parsed.referralCode}`
            );
            // TODO: Implement token detail scene when available
            await ctx.reply(
              "🚧 Token detail view is coming soon...\n\nFor now, you can paste the token address in chat to get basic information."
            );
            break;

          case "pool_detail":
            console.log(
              `Pool detail requested for: ${parsed.poolAddress} on ${parsed.dexCode} with referral: ${parsed.referralCode}`
            );
            if (parsed.dexCode === "meteora" || parsed.dexCode === "saros") {
              await ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
                poolAddress: parsed.poolAddress,
                dex: parsed.dexCode,
              });
              return;
            } else {
              await ctx.reply(
                `❌ Unsupported DEX: ${parsed.dexCode}\n\nWe currently support: meteora, saros`
              );
              // Continue to show welcome message
            }
            break;

          case "position_detail":
            console.log(
              `Position detail requested for: ${parsed.positionAddress} on ${parsed.dexCode} with referral: ${parsed.referralCode}`
            );
            if (parsed.dexCode === "meteora" || parsed.dexCode === "saros") {
              await ctx.scene.enter(SCENE_IDS.POSITION_DETAIL_SCENE, {
                positionAddress: parsed.positionAddress,
              });
              return;
            } else {
              await ctx.reply(
                `❌ Unsupported DEX: ${parsed.dexCode}\n\nWe currently support: meteora, saros`
              );
              // Continue to show welcome message
            }
            break;

          case "referral":
            console.log(`Referral code detected: ${parsed.referralCode}`);
            break;
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
        await ctx.reply(MessageManager.getStartErrorMessage("user_creation"));
        return;
      }

      const startText =
        ctx.message && "text" in ctx.message ? ctx.message.text : "";
      // const referralCode = startText.split(" ")[1];
      let referralMessage = "";

      // console.log(`Start command text: "${startText}"`);
      // console.log(`Extracted referral code: "${referralCode}"`);

      // if (referralCode) {
      //   console.log(`Processing referral with code: ${referralCode}`);
      //   const referralProcessed = await referralService.processReferral(
      //     referralCode,
      //     ctx.user.telegramId
      //   );

      //   if (referralProcessed) {
      //     referralMessage =
      //       "\n\n🎉 *Welcome! You've been referred by a friend and earned 50 bonus points!*";
      //     console.log(
      //       `Referral processed successfully for user ${ctx.user.telegramId}`
      //     );
      //   } else {
      //     referralMessage = "\n\n⚠️ Invalid or expired referral code";
      //     console.log(
      //       `Referral processing failed for user ${ctx.user.telegramId}`
      //     );
      //   }
      // } else {
      //   console.log(`No referral code found in start command`);
      // }

      let solBalance = 0;
      let solPrice = 0;

      if (ctx.user.walletAddress) {
        try {
          [solBalance, solPrice] = await Promise.all([
            solanaService.getBalance(ctx.user.walletAddress),
            solanaService.getSolPrice(),
          ]);
        } catch (error) {
          console.log("Failed to fetch balance:", error);
        }
      }

      const usdValue = solBalance * solPrice;

      const welcomeMessage =
        MessageService.getWelcomeMessage(
          ctx.user.walletAddress,
          solBalance,
          usdValue
        ) + referralMessage;

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
