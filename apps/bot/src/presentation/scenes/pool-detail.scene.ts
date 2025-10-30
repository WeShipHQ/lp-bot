import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { getPoolInfoKeyboard } from "../keyboards";
import { DexType, UnifiedPool } from "@/types/core.types";
import { PoolFormatter } from "../formatters/pool.formatter";
import { container } from "@/infrastructure/di/container";
import { GetPoolDetailsUseCase } from "@/application/trending/get-pool-details.use-case";
import { AnalyzePoolUseCase } from "@/application/ai/analyze-pool.use-case";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";

interface SceneState {
  poolAddress?: string;
  dex?: DexType;
  pool?: UnifiedPool;
  poolType?: string;
}

export const poolDetailScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.POOL_DETAIL_SCENE
);

poolDetailScene.enter(async (ctx) => {
  try {
    const state = ctx.scene.state as SceneState;
    const poolAddress = state.poolAddress;
    const dex = (state.dex ?? "meteora") as DexType;

    if (!poolAddress) {
      await ctx.reply("Pool address not found");
      return ctx.scene.leave();
    }

    const loadingMsg = await ctx.reply("Loading pool details..", {
      parse_mode: "Markdown",
    });

    const useCase = container.get(GetPoolDetailsUseCase);
    const poolData = await useCase.execute({ poolAddress, dex });

    if (!poolData) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        "Pool not found or failed to load",
        { parse_mode: "Markdown" }
      );
      return ctx.scene.leave();
    }

    ctx.scene.state = {
      pool: poolData,
      ...ctx.scene.state,
    };

    const message = PoolFormatter.formatPoolDetails(poolData);
    const keyboard = getPoolInfoKeyboard(poolData.address);

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      message,
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
        ...DISABLE_LINK_PREVIEW,
      }
    );
  } catch (error) {
    console.error(error);
    await ctx.reply("Failed to load position details");
  }
});

poolDetailScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  const { poolAddress, dex } = ctx.scene.state as SceneState;

  if (!poolAddress) {
    await ctx.reply("Pool address not found");
    return ctx.scene.leave();
  }

  return ctx.scene.enter(SCENE_IDS.CREATE_POSITION_SCENE, {
    poolAddress,
    dex: dex ?? "meteora",
  });
});

poolDetailScene.action("refresh_pool_detail", async (ctx) => {
  await ctx.answerCbQuery("⏳ Refreshing pool details...");

  const state = ctx.scene.state as SceneState;
  const poolAddress = state.poolAddress;
  const dex = (state.dex ?? "meteora") as DexType;

  if (!poolAddress || !dex) {
    await ctx.reply("Pool address or DEX not found");
    return ctx.scene.leave();
  }

  const useCase = container.get(GetPoolDetailsUseCase);
  const poolData = await useCase.execute({ poolAddress, dex });
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
        "Pool not found or failed to load",
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply("Pool not found or failed to load", {
        parse_mode: "Markdown",
      });
    }

    return ctx.scene.leave();
  }

  const message = PoolFormatter.formatPoolDetails(poolData);
  const keyboard = getPoolInfoKeyboard(poolData.address);

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

poolDetailScene.action("ask_panda_ai", async (ctx) => {
  try {
    await ctx.answerCbQuery("🐼 Panda AI is analyzing the pool...");

    const state = ctx.scene.state as SceneState;
    const pool = state.pool;

    if (!pool) {
      await ctx.reply("❌ Pool data not available for analysis");
      return;
    }

    // Send a loading message
    const loadingMsg = await ctx.reply(
      "🐼 Panda AI is analyzing the pool... This may take a few moments.",
      {
        parse_mode: "Markdown",
      }
    );

    try {
      const analyzePoolUseCase = container.get(AnalyzePoolUseCase);
      const analysis = await analyzePoolUseCase.execute({ pool });

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        analysis,
        {
          parse_mode: "Markdown",
          ...DISABLE_LINK_PREVIEW,
        }
      );

      const message = PoolFormatter.formatPoolDetails(pool);
      const keyboard = getPoolInfoKeyboard(pool.address);

      await ctx.replyWithMarkdown(message, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
        ...DISABLE_LINK_PREVIEW,
      });
    } catch (analysisError) {
      console.error("Error during AI analysis:", analysisError);

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        "❌ Sorry, Panda AI encountered an error while analyzing the pool. Please try again later.",
        {
          parse_mode: "Markdown",
        }
      );
    }
  } catch (error) {
    console.error("Error in ask_panda_ai action:", error);
    await ctx.reply(
      "❌ An error occurred while requesting AI analysis. Please try again."
    );
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
