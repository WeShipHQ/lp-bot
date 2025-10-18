import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import { positionService } from "@/services/position.service";
import {
  getPositionDetailKeyboard,
  getPositionCloseConfirmKeyboard,
  getClaimFeesConfirmKeyboard,
  getRebalanceConfirmKeyboard,
} from "../keyboards/position-detail-menu";
import { DISABLE_LINK_PREVIEW } from "../handlers";
import { db, Position as DbPosition } from "@/db";
import { poolService } from "@/services/pool.service";
import { getTokenPriceService } from "@/services/token-price.service";
import { formatNumber, formatPrice } from "../utils/formatters";
import { getSolscanLink } from "@/utils/link";
import { loading } from "../utils/text-formatters";

type SceneState = {
  positionAddress?: string;
  position?: DbPosition;
};

export const positionDetailScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.POSITION_DETAIL_SCENE
);

positionDetailScene.enter(async (ctx) => {
  try {
    const state = ctx.scene.state as SceneState;
    const positionAddress = state.positionAddress;
    if (!positionAddress) {
      await ctx.reply(
        MessageService.getErrorMessage("Position address not found")
      );
      return ctx.scene.leave();
    }

    const loadingMsg = await ctx.replyWithMarkdown(
      loading("Loading position..."),
      {
        parse_mode: "Markdown",
      }
    );

    const { dbPosition, lbPosition, lbPair } =
      await positionService.getPositionDetail(positionAddress);

    const poolInfo = await poolService.getPoolV2(dbPosition.poolAddress);

    if (!dbPosition || !poolInfo) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        MessageService.getErrorMessage("Position not found or failed to load"),
        { parse_mode: "Markdown" }
      );
      return ctx.scene.leave();
    }

    ctx.scene.state = {
      ...ctx.scene.state,
      position: dbPosition,
    };

    const prices = await getTokenPriceService().getPrices([
      poolInfo.tokenA.address,
      poolInfo.tokenB.address,
    ]);

    const message = MessageService.getPositionDetailMessageV1(
      dbPosition,
      lbPosition,
      lbPair,
      poolInfo,
      prices[poolInfo.tokenA.address],
      prices[poolInfo.tokenB.address]
    );
    const keyboard = getPositionDetailKeyboard(positionAddress);

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
    return ctx.scene.leave();
  }
});

positionDetailScene.action("pos_close_confirmation", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;
  if (!position) {
    await ctx.reply(
      MessageService.getErrorMessage("Position not found or failed to load")
    );
    return ctx.scene.leave();
  }

  const confirmationMessage =
    `🔍 **Confirm Position Closure**\n\n` +
    `Are you sure you want to close this position?\n` +
    `Position: \`${position.positionAddress}\`\n\n` +
    `This action cannot be undone.`;

  const keyboard = getPositionCloseConfirmKeyboard(position.positionAddress);

  await ctx.reply(confirmationMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
});

positionDetailScene.action("pos_close_yes", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;

  if (!position) {
    await ctx.reply(
      MessageService.getErrorMessage("Position not found or failed to load")
    );
    return ctx.scene.leave();
  }

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }

  const loadingMsg = await ctx.reply("⏳ **Closing position...**", {
    parse_mode: "Markdown",
  });

  try {
    const { success, transactionId, error } =
      await positionService.closePositionV1(
        ctx.user,
        position.poolAddress,
        position.positionAddress
      );

    if (!success) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        MessageService.getErrorMessage(error || "Failed to close position"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    const pnl = {
      usd: "$1.00",
      percentage: "2.00%",
    };

    const successMessage =
      `✅ **Position Closed**\n\n` +
      `PnL: ${pnl?.usd || "$0.00"} (${pnl?.percentage || "0.00%"})\n` +
      `Transaction: [View on Solscan](https://solscan.io/tx/${transactionId})`;

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      successMessage,
      {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      }
    );
  } catch (error) {
    console.error("Error closing position:", error);
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      MessageService.getErrorMessage("Failed to close position"),
      { parse_mode: "Markdown" }
    );
  }
});

positionDetailScene.action("pos_close_no", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }
});

positionDetailScene.action("pos_claim_confirmation", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;

  if (!position) {
    await ctx.reply(
      MessageService.getErrorMessage("Position not found or failed to load")
    );
    return ctx.scene.leave();
  }

  const confirmationMessage =
    `💰 *Claim LP Fees*\n\n` +
    `Would you like to claim LP fees and swap it all to SOL? Confirm below\n\n` +
    `Position: \`${position.positionAddress}\`\n\n` +
    `This action will claim all available fees and convert them to SOL.`;

  const keyboard = getClaimFeesConfirmKeyboard(position.positionAddress);

  await ctx.reply(confirmationMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
});

positionDetailScene.action(/^pos_claim_yes_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }

  const loadingMsg = await ctx.reply("⏳ **Claiming fees...**", {
    parse_mode: "Markdown",
  });

  try {
    const position = await db.query.positions.findFirst({
      where: (positions, { eq }) =>
        eq(positions.positionAddress, positionAddress),
    });

    if (!position) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        MessageService.getErrorMessage("Position not found"),
        { parse_mode: "Markdown" }
      );
      return;
    }

    // await delay(1000);

    const results = await positionService.claimFeeV1(ctx.user, position.id);
    console.log("results", results);

    const successMessage =
      `✅ *Fees Claimed Successfully*\n\n` +
      `All available LP fees have been claimed and swapped to SOL.\n\n` +
      `💰 *Claimed Details:*\n` +
      `• ${position.tokenX?.symbol}: ${formatNumber(Number(results.claimedFeeXAmount), { maxDecimals: 5 })} (${formatPrice(Number(results.claimedFeeXValueUSD), { maxDecimals: 2 })})\n` +
      `• ${position.tokenY?.symbol}: ${formatNumber(Number(results.claimedFeeYAmount), { maxDecimals: 5 })} (${formatPrice(Number(results.claimedFeeYValueUSD), { maxDecimals: 2 })})\n` +
      `• Total USD Value: ${formatPrice(Number(results.totalClaimedFeeUSD), { maxDecimals: 2 })}\n` +
      `• Transaction: [View on Solscan](${getSolscanLink("tx", results.transactionId || "")})\n\n` +
      `📊 *Updated Position:*\n` +
      `• Total Claimed Fees: ${formatPrice(Number(results.totalClaimedFees), { maxDecimals: 2 })}\n` +
      `• Cumulative PnL: ${formatPrice(Number(results.cumulativePnL), { maxDecimals: 2 })}\n`;

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      successMessage,
      {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      }
    );
  } catch (error) {
    console.error("Error claiming fees:", error);
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      MessageService.getErrorMessage("Failed to claim fees"),
      { parse_mode: "Markdown" }
    );
  }
});

positionDetailScene.action("pos_claim_no", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }
});

positionDetailScene.action("pos_rebalance_confirmation", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;

  if (!position) {
    await ctx.reply(
      MessageService.getErrorMessage("Position not found or failed to load")
    );
    return ctx.scene.leave();
  }

  const confirmationMessage =
    `⚖️ **Rebalance Position**\n\n` +
    `Would you like to rebalance this position now? Confirm below\n\n` +
    `Position: \`${position.positionAddress}\`\n\n` +
    `This action will rebalance your position to optimize liquidity distribution.`;

  const keyboard = getRebalanceConfirmKeyboard(position.positionAddress);

  await ctx.reply(confirmationMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
});

positionDetailScene.action(/^pos_rebalance_yes_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }

  const loadingMsg = await ctx.reply(loading("Rebalancing position..."), {
    parse_mode: "Markdown",
  });

  try {
    // TODO: Implement actual rebalance logic here
    const results = await positionService.rebalanceV1(ctx.user, positionAddress);

    // For now, just show a placeholder success message
    const successMessage =
      `✅ **Position Rebalanced Successfully**\n\n` +
      `Your position has been rebalanced to optimize liquidity distribution.\n` +
      `Position: \`${positionAddress}\``;

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      successMessage,
      {
        parse_mode: "Markdown",
        link_preview_options: { is_disabled: true },
      }
    );
  } catch (error) {
    console.error("Error rebalancing position:", error);
    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      loadingMsg.message_id,
      undefined,
      MessageService.getErrorMessage("Failed to rebalance position"),
      { parse_mode: "Markdown" }
    );
  }
});

positionDetailScene.action("pos_rebalance_no", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    await ctx.deleteMessage();
  } catch (error) {
    console.log("Could not delete confirmation message:", error);
  }
});

positionDetailScene.action(/^pos_settings_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];
  // TODO: Implement rebalancing settings logic
  await ctx.reply(
    `⚙️ Opening rebalancing settings for position ${positionAddress}...`
  );
});

positionDetailScene.action(/^pos_take_profit_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];
  // TODO: Implement take profit logic
  await ctx.reply(`📈 Setting take profit for position ${positionAddress}...`);
});

positionDetailScene.action(/^pos_stop_loss_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];
  // TODO: Implement stop loss logic
  await ctx.reply(`📉 Setting stop loss for position ${positionAddress}...`);
});

positionDetailScene.action(/^pos_refresh_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery("Loading position...");
  const positionAddress = ctx.match[1];

  try {
    const { dbPosition, lbPosition, lbPair } =
      await positionService.getPositionDetail(positionAddress);

    const poolInfo = await poolService.getPoolV2(dbPosition.poolAddress);

    if (!dbPosition || !poolInfo) {
      await ctx.replyWithMarkdown(
        MessageService.getErrorMessage("Position not found or failed to load"),
        { parse_mode: "Markdown" }
      );
      return ctx.scene.leave();
    }

    ctx.scene.state = {
      ...ctx.scene.state,
      position: dbPosition,
    };

    const prices = await getTokenPriceService().getPrices([
      poolInfo.tokenA.address,
      poolInfo.tokenB.address,
    ]);

    const message = MessageService.getPositionDetailMessageV1(
      dbPosition,
      lbPosition,
      lbPair,
      poolInfo,
      prices[poolInfo.tokenA.address],
      prices[poolInfo.tokenB.address]
    );

    const keyboard = getPositionDetailKeyboard(positionAddress);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
      ...DISABLE_LINK_PREVIEW,
    });
  } catch (error) {
    console.error(error);
    await ctx.replyWithMarkdown(
      MessageService.getErrorMessage("Failed to refresh position details")
    );
  }
});

positionDetailScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.STRATEGY_SELECTION, ctx.scene.state);
});
