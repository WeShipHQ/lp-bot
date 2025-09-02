import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import { MeteoraPoolData } from "@/types/meteora.types";
import { poolService } from "@/services/pool.service";
import { getPoolInfoKeyboard } from "../keyboards";

type SceneState = {
  poolAddress?: string;
  pool?: MeteoraPoolData;
};

export const poolDetailScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.POOL_DETAIL_SCENE
);

poolDetailScene.enter(async (ctx) => {
  try {
    const state = ctx.scene.state as SceneState;
    const poolAddress = state.poolAddress;
    if (!poolAddress) {
      await ctx.reply(MessageService.getErrorMessage("Pool address not found"));
      return ctx.scene.leave();
    }

    const loadingMsg = await ctx.reply("⏳ **Loading pool details...**", {
      parse_mode: "Markdown",
    });

    const poolData = await poolService.getPool(poolAddress, "dlmm");

    ctx.scene.state = {
      pool: poolData,
      ...ctx.scene.state,
    };

    if (!poolData) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        MessageService.getErrorMessage("Pool not found or failed to load"),
        { parse_mode: "Markdown" }
      );
      return ctx.scene.leave();
    }

    const message = MessageService.formatPoolInfo(poolData);
    const keyboard = getPoolInfoKeyboard(poolData.pool_address);

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      message,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    console.error(error);
    await ctx.reply(
      MessageService.getErrorMessage("Failed to load position details")
    );
  }
});

poolDetailScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  const poolAddress = (ctx.scene.state as SceneState).poolAddress;

  if (!poolAddress) {
    await ctx.reply(MessageService.getErrorMessage("Pool address not found"));
    return ctx.scene.leave();
  }

  return ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, {
    poolAddress,
  });
});

poolDetailScene.action("refresh_pool_detail", async (ctx) => {
  await ctx.answerCbQuery("⏳ Refreshing pool details...");

  const state = ctx.scene.state as SceneState;
  const poolAddress = state.poolAddress;

  if (!poolAddress) {
    await ctx.reply(MessageService.getErrorMessage("Pool address not found"));
    return ctx.scene.leave();
  }

  const poolData = await poolService.getPool(poolAddress, "dlmm");
  ctx.scene.state = {
    pool: poolData,
    ...ctx.scene.state,
  };

  if (!poolData) {
    if (ctx.callbackQuery.message) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        ctx.callbackQuery.message.message_id,
        undefined,
        MessageService.getErrorMessage("Pool not found or failed to load"),
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply(
        MessageService.getErrorMessage("Pool not found or failed to load"),
        { parse_mode: "Markdown" }
      );
    }

    return ctx.scene.leave();
  }

  const message = MessageService.formatPoolInfo(poolData);
  const keyboard = getPoolInfoKeyboard(poolData.pool_address);

  if (ctx.callbackQuery.message) {
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      ctx.callbackQuery.message.message_id,
      undefined,
      message,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      }
    );
  } else {
    await ctx.reply(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
});

poolDetailScene.action("close_pool_detail", async (ctx) => {
  try {
    await ctx.answerCbQuery("✅ Closing pool details");
    await ctx.deleteMessage();
    return ctx.scene.leave();
  } catch (error) {
    console.error("Error closing pool details:", error);

    try {
      await ctx.editMessageText("Pool details closed.", {
        parse_mode: "Markdown",
      });
    } catch (editError) {
      console.error("Error editing message:", editError);
      await ctx.answerCbQuery("❌ Failed to close properly");
    }

    return ctx.scene.leave();
  }
});
