import { Scenes } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import { positionService } from "@/services/position.service";
import {
  getPositionDetailKeyboard,
  getPositionCloseConfirmKeyboard,
} from "../keyboards/position-detail-menu";
import { MeteoraDlmmPosition } from "@/types/meteora.types";
import { meteoraPoolService } from "@/services/meteora/pool.service";

type SceneState = {
  positionAddress?: string;
  position?: MeteoraDlmmPosition;
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

    const loadingMsg = await ctx.reply("⏳ **Loading position details...**", {
      parse_mode: "Markdown",
    });

    const { position, lbPosition, lpPair } =
      await positionService.getPosition(positionAddress);

    ctx.scene.state = {
      position: position,
      ...ctx.scene.state,
    };

    console.log("positionData", position);

    if (!position) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        loadingMsg.message_id,
        undefined,
        MessageService.getErrorMessage("Position not found or failed to load"),
        { parse_mode: "Markdown" }
      );
      return ctx.scene.leave();
    }

    // const poolInfo = await meteoraPoolService.getPoolInfo(
    //   position.pair_address,
    //   'dlmm'
    // );

    const message = MessageService.getPositionDetailMessageV1(
      position,
      lbPosition,
      // poolInfo,
      lpPair
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
    `Position: \`${position.address}\`\n\n` +
    `This action cannot be undone.`;

  const keyboard = getPositionCloseConfirmKeyboard(position.address);

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
      await positionService.closePosition(ctx.user, position);

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

positionDetailScene.action(/^pos_claim_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];
  // TODO: Implement claim fees logic
  await ctx.reply(`💰 Claiming fees for position ${positionAddress}...`);
});

positionDetailScene.action(/^pos_rebalance_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];
  // TODO: Implement rebalance logic
  await ctx.reply(`⚖️ Rebalancing position ${positionAddress}...`);
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
  await ctx.answerCbQuery();
  const positionAddress = ctx.match[1];

  try {
    const positionData = await positionService.getPosition(positionAddress);

    if (!positionData) {
      await ctx.reply(
        MessageService.getErrorMessage("Position not found or failed to load")
      );
      return;
    }

    const message = MessageService.getPositionDetailMessageV1(positionData);
    const keyboard = getPositionDetailKeyboard(positionAddress);

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (error) {
    console.error(error);
    await ctx.reply(
      MessageService.getErrorMessage("Failed to refresh position details")
    );
  }
});

positionDetailScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.STRATEGY_SELECTION, ctx.scene.state);
});
