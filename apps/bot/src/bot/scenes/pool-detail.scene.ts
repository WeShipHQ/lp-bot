import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import { poolService } from "@/services/pool.service";
import { getPoolInfoKeyboard } from "../keyboards";
import { loading } from "../utils/text-formatters";
import { DISABLE_LINK_PREVIEW } from "../handlers";
import { Pool } from "@/types/pool.types";
import {
  formatNumber,
  formatPrice,
  formatPercentage,
  formatAPR,
} from "../utils/formatters";


function formatPoolDetails(pool: Pool): string {
  if (!pool) {
    return "Error: Pool data not available";
  }

  const tokenASymbol = pool.tokenA?.symbol || "Unknown";
  const tokenBSymbol = pool.tokenB?.symbol || "Unknown";
  const tokenPair = `${tokenASymbol}/${tokenBSymbol}`;
  const poolType = pool.type || "DLMM";

  const poolAddress = pool.address || "Unknown";
  let shortPoolAddress = "Unknown";
  let poolSolscanLink = "#";

  if (poolAddress && poolAddress !== "Unknown") {
    shortPoolAddress = `${poolAddress.substring(0, 4)}…${poolAddress.substring(poolAddress.length - 4)}`;
    poolSolscanLink = `https://solscan.io/account/${poolAddress}`;
  }

  const tokenAMint = pool.tokenA?.address || "Unknown";
  let shortTokenAMint = "Unknown";
  let tokenASolscanLink = "#";

  if (tokenAMint && tokenAMint !== "Unknown") {
    shortTokenAMint = `${tokenAMint.substring(0, 4)}…${tokenAMint.substring(tokenAMint.length - 4)}`;
    tokenASolscanLink = `https://solscan.io/token/${tokenAMint}`;
  }

  const tokenBMint = pool.tokenB?.address || "Unknown";
  let shortTokenBMint = "Unknown";
  let tokenBSolscanLink = "#";

  if (tokenBMint && tokenBMint !== "Unknown") {
    shortTokenBMint = `${tokenBMint.substring(0, 4)}…${tokenBMint.substring(tokenBMint.length - 4)}`;
    tokenBSolscanLink = `https://solscan.io/token/${tokenBMint}`;
  }

  const tvl =
    "$" + formatNumber(parseFloat(pool.tvl || "0"), { useSuffixes: true });
  const apy = formatAPR(pool.apy, { cap: 10000 });

  const fee24h =
    "$" + formatNumber(pool.fees?.hour24 || 0, { useSuffixes: true });

  const feeTvlRatio = pool.feeTvlRatio?.hour24
    ? formatPercentage(pool.feeTvlRatio.hour24 * 100, { decimals: 2 })
    : "N/A";

  const volume24h =
    "$" + formatNumber(pool.volume?.hour24 || 0, { useSuffixes: true });

  const explorerLink = `[Explorer](${poolSolscanLink})`;
  const dexscreenerLink =
    poolAddress !== "Unknown"
      ? `[Dexscreener](https://dexscreener.com/solana/${poolAddress})`
      : "[Dexscreener](#)";

  return `*${tokenPair} | ${poolType}*
${shortPoolAddress} (${poolSolscanLink})
A mint: ${shortTokenAMint} (${tokenASolscanLink})
B mint: ${shortTokenBMint} (${tokenBSolscanLink})

${explorerLink} | ${dexscreenerLink}

*TVL:* ${tvl}
*APY (24h):* ${apy}
*Fee (24h):* ${fee24h}
*Fee/TVL (24h):* ${feeTvlRatio}

*Volume*
24h: ${volume24h}`;
}

type SceneState = {
  poolAddress?: string;
  pool?: Pool;
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

    const loadingMsg = await ctx.reply(`${loading("Loading pool details..")}`, {
      parse_mode: "Markdown",
    });

    const poolData = await poolService.getPoolV2(poolAddress);

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

    const message = formatPoolDetails(poolData);
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

  const poolData = await poolService.getPoolV2(poolAddress);
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

  const message = formatPoolDetails(poolData);
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
