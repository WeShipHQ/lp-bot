import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { positionService } from "@/services/position.service";
import {
  getPositionDetailKeyboard,
  getPositionCloseConfirmKeyboard,
  getClaimFeesConfirmKeyboard,
  getRebalanceConfirmKeyboard,
} from "../keyboards/position-detail-menu";
import { db, Position as DbPosition, Position } from "@/db";
import { poolService } from "@/services/pool.service";
import { getTokenPriceService } from "@/services/token-price.service";
import { getSolscanLink } from "@/utils/link";
import { container } from "@/infrastructure/di/container";
import { ClosePositionUseCase } from "@/application/position/close-position.use-case";
import { ClaimFeesUseCase } from "@/application/position/claim-fees.use-case";
import { link, loading } from "@/utils/misc";
import {
  formatNumber,
  formatPercentage,
  formatPrice,
} from "../formatters/base.formatter";
import Decimal from "decimal.js";
import { LbPair, LbPosition } from "@meteora-ag/dlmm";
import { Pool } from "@/types/pool.types";
import { TokenPrice } from "@/types/token.types";
import { PositionPnlResult } from "@/types/position.types";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";
import { RebalancePositionUseCase } from "@/application/position/rebalance-position.use-case";

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
      await ctx.reply("Position address not found");
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
        "Position not found or failed to load",
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

    const message = getPositionDetailMessageV1(
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
    await ctx.reply("Failed to load position details");
    return ctx.scene.leave();
  }
});

positionDetailScene.action("pos_close_confirmation", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;
  if (!position) {
    await ctx.reply("Position not found or failed to load");
    return ctx.scene.leave();
  }

  const confirmationMessage =
    `🔍 **Confirm Position Closure**\n\n` +
    `Are you sure you want to close this position?\n` +
    `Position: \`${position.positionAddress}\`\n\n` +
    `This action cannot be undone.`;

  const keyboard = getPositionCloseConfirmKeyboard();

  await ctx.reply(confirmationMessage, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
});

positionDetailScene.action("pos_close_yes", async (ctx) => {
  await ctx.answerCbQuery();
  const position = (ctx.scene.state as SceneState).position;

  if (!position) {
    await ctx.reply("Position not found or failed to load");
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
    // Use DI use case
    const uc = container.get(ClosePositionUseCase);
    const res = await uc.execute({
      userId: ctx.user.id,
      positionId: position.id,
      userAddress: ctx.user.walletAddress as string,
      walletId: ctx.user.walletId as string | undefined,
    });

    if (!res.success) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        res.error || "Failed to close position",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const successMessage =
      `✅ **Position Closed**\n\n` +
      `Transaction: [View on Solscan](https://solscan.io/tx/${res.signature})`;

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
      "Failed to close position",
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
    await ctx.reply("Position not found or failed to load");
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
        "Position not found",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const uc = container.get(ClaimFeesUseCase);
    const res = await uc.execute({
      userId: ctx.user.id,
      positionId: position.id,
      userAddress: ctx.user.walletAddress as string,
      walletId: ctx.user.walletId as string | undefined,
    });

    if (!res.success) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        res.error || "Failed to claim fees",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const successMessage =
      `✅ *Fees Claimed Successfully*\n\n` +
      `All available LP fees have been claimed.\n\n` +
      (typeof res.claimedFeesUsd === "number"
        ? `• Claimed Fees (est): ${formatPrice(res.claimedFeesUsd, { maxDecimals: 2 })}\n`
        : ``) +
      `• Transaction: [View on Solscan](${getSolscanLink("tx", res.signature || "")})\n`;

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
      "Failed to claim fees",
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
    await ctx.reply("Position not found or failed to load");
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
    const position = await db.query.positions.findFirst({
      where: (positions, { eq }) =>
        eq(positions.positionAddress, positionAddress),
    });

    if (!position) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        "❌ Position not found",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const rebalanceUc = container.get(RebalancePositionUseCase);

    const res = await rebalanceUc.execute({
      userId: ctx.user.id,
      positionId: position.id,
      userAddress: ctx.user.walletAddress!,
      walletId: ctx.user.walletId,
      metadata: {
        trigger: "manual",
        rangeInterval: ctx.user.balancedPositionBinRange,
      },
    });

    if (!res.success) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        `❌ *Rebalance Failed*\n\n${res.error || "Unknown error"}`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const successMessage =
      `✅ *Position Rebalance Initiated*\n\n` +
      `Your position rebalance has been submitted to the blockchain.\n\n` +
      `Transaction: [View on Solscan](${getSolscanLink("tx", res.signature || "")})\n\n` +
      `⏳ You'll receive a notification when the rebalance is complete.`;

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
      "❌ Failed to rebalance position. Please try again.",
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
      await ctx.replyWithMarkdown("Position not found or failed to load", {
        parse_mode: "Markdown",
      });
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

    const message = getPositionDetailMessageV1(
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
    await ctx.replyWithMarkdown("Failed to refresh position details");
  }
});

positionDetailScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.STRATEGY_SELECTION, ctx.scene.state);
});

function getPositionDetailMessageV1(
  position: Position,
  lbPosition: LbPosition,
  lbPair: LbPair,
  poolInfo: Pool,
  tokenAPrice: TokenPrice,
  tokenBPrice: TokenPrice
): string {
  const meteoraUrl = link(
    "Meteora",
    `https://www.meteora.ag/dlmm/${poolInfo.address}`
  );

  let message = `*${poolInfo.name}* | ${meteoraUrl} \n\n`;

  const positionData = lbPosition.positionData;

  const { pnlUsd, pnlPercentage } = calculatePositionPnl(
    position,
    lbPosition,
    tokenAPrice,
    tokenBPrice
  );

  const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
    new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals))
  );
  const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
    new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals))
  );

  const tokenXUSD = totalXAmount.mul(tokenAPrice.price);
  const tokenYUSD = totalYAmount.mul(tokenBPrice.price);
  const totalUSD = tokenXUSD.add(tokenYUSD);

  const positionBinData = lbPosition.positionData.positionBinData;
  const startBin = positionBinData[0];
  const lastBin = positionBinData.slice(-1)[0];

  const startPrice = startBin.pricePerToken;
  const endPrice = lastBin.pricePerToken;
  const poolPrice = poolInfo.currentPrice;

  const claimedFeesX = new Decimal(
    positionData.totalClaimedFeeXAmount.toString()
  ).div(new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals)));
  const claimedFeesY = new Decimal(
    positionData.totalClaimedFeeYAmount.toString()
  ).div(new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals)));
  const claimedFeesUSD = claimedFeesX
    .mul(tokenAPrice.price)
    .add(claimedFeesY.mul(tokenBPrice.price));

  const unclaimedFeesX = new Decimal(positionData.feeX.toString()).div(
    new Decimal(10).pow(new Decimal(poolInfo.tokenA.decimals))
  );
  const unclaimedFeesY = new Decimal(positionData.feeY.toString()).div(
    new Decimal(10).pow(new Decimal(poolInfo.tokenB.decimals))
  );
  const unclaimedFeesXUSD = unclaimedFeesX.mul(tokenAPrice.price);
  const unclaimedFeesYUSD = unclaimedFeesY.mul(tokenBPrice.price);
  const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

  const activeId = Number(lbPair.activeId);
  const inRange =
    activeId >= positionData.lowerBinId && activeId <= positionData.upperBinId;

  const netProfitFormatted = `Net Profit: *${formatPrice(Number(pnlUsd), { maxDecimals: 2 })} (${formatPercentage(Number(pnlPercentage))})*`;
  const positionBalanceFormatted = `Position Balance: *${formatNumber(totalXAmount.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(totalYAmount.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(totalUSD), { maxDecimals: 2 })})*`;
  const positionRangeFormatted = `Position Range: *${formatNumber(startPrice, { maxDecimals: 6 })} - ${formatNumber(endPrice, { maxDecimals: 6 })} ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}*`;
  const poolPriceFormatted = `Pool Price: *${formatNumber(poolPrice, { maxDecimals: 6 })} ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}*`;

  const claimedFeeFormatted = `Claimed Fees: *${formatNumber(claimedFeesX.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(claimedFeesY.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(claimedFeesUSD), { maxDecimals: 2 })})*`;
  const unclaimedFeeFormatted = `Unclaimed Fees: *${formatNumber(unclaimedFeesX.toString(), { maxDecimals: 6 })} ${poolInfo.tokenA.symbol} / ${formatNumber(unclaimedFeesY.toString(), { maxDecimals: 6 })} ${poolInfo.tokenB.symbol} (${formatPrice(Number(totalUnclaimedFeesUSD), { maxDecimals: 2 })})*`;

  const inRangeFormatted = `In Range: ${inRange ? "🟢" : "🔴"}`;

  message += `${netProfitFormatted}\n`;
  message += `${positionBalanceFormatted}\n`;
  message += `${positionRangeFormatted}\n`;
  message += `${poolPriceFormatted}\n\n`;
  message += `${claimedFeeFormatted}\n`;
  message += `${unclaimedFeeFormatted}\n`;
  message += `${inRangeFormatted}\n`;

  return message;
}

function calculatePositionPnl(
  position: Position,
  lbPosition?: LbPosition,
  priceX?: TokenPrice,
  priceY?: TokenPrice
): PositionPnlResult {
  const initialValueUsd = new Decimal(position.initialValueUSD || "0");
  const cumulativeAbsolutePnlUsd = new Decimal(
    position.totalRealizedPnlUSD || "0"
  );
  const currentSegmentInitialUsd = new Decimal(
    position.currentSegmentInitialUSD || initialValueUsd.toString()
  );

  // For closed positions, use final values
  if (position.status === "CLOSED") {
    const finalValueUsd = new Decimal(position.finalValueUSD || "0");
    const realizedPnlUsd = cumulativeAbsolutePnlUsd.toNumber();
    const realizedPnlPercentage = finalValueUsd
      .div(initialValueUsd)
      .minus(1)
      .times(100)
      .toNumber();

    return {
      pnlUsd: realizedPnlUsd,
      pnlPercentage: realizedPnlPercentage,
      unrealizedPnlUsd: 0,
      unrealizedPnlPercentage: 0,
    };
  }

  // For active positions, calculate unrealized PNL
  if (!lbPosition || !priceX || !priceY) {
    throw new Error("Current position data required for active positions");
  }

  const totalXAmount = new Decimal(lbPosition.positionData.totalXAmount).div(
    new Decimal(10).pow(new Decimal(priceX.decimals))
  );
  const totalYAmount = new Decimal(lbPosition.positionData.totalYAmount).div(
    new Decimal(10).pow(new Decimal(priceY.decimals))
  );

  const tokenXUSD = totalXAmount.mul(priceX.price);
  const tokenYUSD = totalYAmount.mul(priceY.price);
  const totalUSD = tokenXUSD.add(tokenYUSD);

  const unclaimedFeesX = new Decimal(
    lbPosition.positionData.feeX.toString()
  ).div(new Decimal(10).pow(new Decimal(priceX.decimals)));
  const unclaimedFeesY = new Decimal(
    lbPosition.positionData.feeY.toString()
  ).div(new Decimal(10).pow(new Decimal(priceY.decimals)));
  const unclaimedFeesXUSD = unclaimedFeesX.mul(priceX.price);
  const unclaimedFeesYUSD = unclaimedFeesY.mul(priceY.price);
  const totalUnclaimedFeesUSD = unclaimedFeesXUSD.add(unclaimedFeesYUSD);

  const currentValueUsd = totalUSD.add(totalUnclaimedFeesUSD);

  // Calculate unrealized PNL based on rebalancing status
  let unrealizedPnlUsd: Decimal;
  let unrealizedPnlPercentage: Decimal;

  if (position.isRebalancingEnabled) {
    // With rebalancing: Calculate segment unrealized + cumulative
    const segmentUnrealizedUsd = currentValueUsd.minus(
      currentSegmentInitialUsd
    );
    unrealizedPnlUsd = cumulativeAbsolutePnlUsd.plus(segmentUnrealizedUsd);
    unrealizedPnlPercentage = unrealizedPnlUsd
      .div(initialValueUsd)
      .minus(1)
      .times(100);
  } else {
    // Without rebalancing: Simple calculation
    const positionUnrealizedUsd = currentValueUsd.minus(initialValueUsd);
    unrealizedPnlUsd = positionUnrealizedUsd.plus(cumulativeAbsolutePnlUsd);
    unrealizedPnlPercentage = currentValueUsd
      .plus(cumulativeAbsolutePnlUsd)
      .div(initialValueUsd)
      .minus(1)
      .times(100);
  }

  return {
    pnlUsd: unrealizedPnlUsd.toNumber(),
    pnlPercentage: unrealizedPnlPercentage.toNumber(),
    unrealizedPnlUsd: unrealizedPnlUsd.toNumber(),
    unrealizedPnlPercentage: unrealizedPnlPercentage.toNumber(),
  };
}
