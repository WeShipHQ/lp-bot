import { Markup, Scenes } from "telegraf";
import { FastifyInstance } from "fastify";
import { inputDetectionService } from "../../services/input-detection.service";
import { jupiterService } from "../../services/jupiter.service";
import { meteoraService } from "../../services/meteora.service";
import {
  formatTokenDisplayData,
  formatErrorMessage,
  formatLoadingMessage,
  formatPoolInfo,
} from "../utils/formatters";
import {
  MeteoraPoolData,
  TokenDisplayData,
  TokenInfo,
  TokenInputDetection,
} from "../../types/token.types";
import { getPoolInfoKeyboard, getTokenInfoKeyboard } from "../keyboards";
import { BotContext } from "@/types/bot.types";
import { logger } from "@/utils/logger";
import { message } from "telegraf/filters";
import { positionService } from "@/services/position.service";
import { meteoraDlmmService } from "@/services/meteora/dlmm.service";

type SceneState = {
  detection: TokenInputDetection;
  tokenInfo?: TokenInfo;
  poolInfo?: MeteoraPoolData;
  strategy?: any;
  selectedSide?: any;
  amount?: number;
};

const SCENE_IDS = {
  TOKEN_INPUT: "TOKEN_INPUT_SCENE",
  POOL_SELECTION: "POOL_SELECTION_SCENE",
  STRATEGY_SELECTION: "STRATEGY_SELECTION_SCENE",
  AMOUNT_INPUT: "AMOUNT_INPUT_SCENE",
  CUSTOM_AMOUNT: "CUSTOM_AMOUNT_SCENE",
  SIDE_SELECTION: "SIDE_SELECTION_SCENE",
  CONFIRMATION: "CONFIRMATION_SCENE",
};

const inputMessageScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.TOKEN_INPUT
);

inputMessageScene.enter(async (ctx) => {
  const detection = (ctx.scene.state as SceneState)
    .detection as TokenInputDetection;

  if (detection.type === "address") {
    try {
      const loadingMessage = formatLoadingMessage(detection.type);
      const sentMessage = await ctx.reply(loadingMessage);

      logger.info(`Fetching token info for address: ${detection.value}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const tokenInfo = await jupiterService.getTokenInfo(detection.value);

      let responseMessage = "";

      if (!tokenInfo) {
        responseMessage = formatErrorMessage(
          detection.value,
          "Token not found or invalid address"
        );
      } else {
        (ctx.scene.state as SceneState).tokenInfo = tokenInfo;

        const displayData: TokenDisplayData = {
          token: tokenInfo,
        };
        responseMessage = formatTokenDisplayData(displayData);
      }

      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        sentMessage.message_id,
        undefined,
        responseMessage,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: getTokenInfoKeyboard(
              detection.value,
              "token",
              "dlmm"
            ).inline_keyboard,
          },
        }
      );
    } catch (error) {
      await ctx.reply(
        "❌ Failed to fetch token information. Please try again."
      );
      return ctx.scene.leave();
    }
  } else {
    const loadingMessage = formatLoadingMessage(detection.type);
    const sentMessage = await ctx.reply(loadingMessage);

    logger.info(`Fetching pool info for ${detection.type}: ${detection.value}`);

    const poolType = inputDetectionService.getMeteoraPoolType(
      detection.originalInput
    );

    let responseMessage = "";

    if (!poolType) {
      responseMessage = formatErrorMessage(
        detection.originalInput,
        "Invalid Meteora pool URL"
      );
    } else {
      const poolData = await meteoraService.getPoolInfo(
        detection.value,
        poolType
      );

      if (!poolData) {
        responseMessage = formatErrorMessage(
          detection.originalInput,
          "Pool not found or invalid pool ID"
        );
      } else {
        // ----
        meteoraDlmmService.calculatePoolDepositAmount(poolData.pool_address, 0.1);
        //---
        (ctx.scene.state as SceneState).poolInfo = poolData;
        responseMessage = formatPoolInfo(poolData);
      }
    }

    await ctx.telegram.editMessageText(
      ctx.chat?.id,
      sentMessage.message_id,
      undefined,
      responseMessage,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: getPoolInfoKeyboard(detection.value).inline_keyboard,
        },
      }
    );
  }
});

inputMessageScene.action("open_position", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.STRATEGY_SELECTION, ctx.scene.state);
});

// Scene: Strategy Selection
const strategySelectionScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.STRATEGY_SELECTION
);

strategySelectionScene.enter(async (ctx) => {
  // TODO check poolInfo existence
  const poolInfo = (ctx.scene.state as SceneState).poolInfo as MeteoraPoolData;

  await ctx.reply(
    `🎯 **Choose Your Strategy**\n\n` +
      `Pool: ${poolInfo.token_a_symbol}/${poolInfo.token_b_symbol}\n\n` +
      `📊 **Spot**: Equal distribution across price range\n` +
      `📈 **Curve**: Concentrated around current price\n` +
      `🎯 **Single-Sided**: Provide liquidity in one token only`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("📊 Spot", "strategy_spot")],
        [Markup.button.callback("📈 Curve", "strategy_curve")],
        [Markup.button.callback("🎯 Single-Sided", "strategy_single")],
      ]),
    }
  );
});

strategySelectionScene.action(/^strategy_(spot|curve|single)$/, async (ctx) => {
  const strategy = ctx.match[1];
  (ctx.scene.state as SceneState).strategy = strategy;
  await ctx.answerCbQuery();

  if (strategy === "single") {
    return ctx.scene.enter(SCENE_IDS.SIDE_SELECTION, ctx.scene.state);
  } else {
    return ctx.scene.enter(SCENE_IDS.AMOUNT_INPUT, ctx.scene.state);
  }
});

// Scene: Side Selection (for Single-Sided strategy)
const sideSelectionScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.SIDE_SELECTION
);

sideSelectionScene.enter(async (ctx) => {
  // TODO check poolInfo existence
  const poolInfo = (ctx.scene.state as SceneState).poolInfo as MeteoraPoolData;
  console.log("sideSelectionScene pool", poolInfo);

  await ctx.reply(
    `🎯 **Choose a side to supply liquidity**\n\n` +
      `Select which token you want to provide:`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `💰 ${poolInfo.token_a_symbol}`,
            `side_${poolInfo.token_a_symbol}`
          ),
        ],
        [
          Markup.button.callback(
            `🪙 ${poolInfo.token_b_symbol}`,
            `side_${poolInfo.token_b_symbol}`
          ),
        ],
      ]),
    }
  );
});

sideSelectionScene.action(/^side_(.+)$/, async (ctx) => {
  const selectedSide = ctx.match[1];
  (ctx.scene.state as SceneState).selectedSide = selectedSide;
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.AMOUNT_INPUT, ctx.scene.state);
});

// Scene: Amount Input
const amountInputScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.AMOUNT_INPUT
);

amountInputScene.enter(async (ctx) => {
  // TODO check poolInfo existence
  const strategy = (ctx.scene.state as SceneState).strategy;
  const selectedSide = (ctx.scene.state as SceneState).selectedSide;

  let message = `💰 **How much do you want to add?**\n\n`;

  if (strategy === "single" && selectedSide) {
    message += `Strategy: Single-Sided (${selectedSide})\n`;
  } else {
    message += `Strategy: ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}\n`;
  }

  await ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("1 SOL", "amount_1")],
      [Markup.button.callback("5 SOL", "amount_5")],
      [Markup.button.callback("10 SOL", "amount_10")],
      [Markup.button.callback("💭 Custom", "amount_custom")],
    ]),
  });
});

amountInputScene.action(/^amount_(\d+)$/, async (ctx) => {
  const amount = parseInt(ctx.match[1]);
  (ctx.scene.state as SceneState).amount = amount;
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.CONFIRMATION, ctx.scene.state);
});

amountInputScene.action("amount_custom", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter(SCENE_IDS.CUSTOM_AMOUNT, ctx.scene.state);
});

// Scene: Custom Amount Input
const customAmountScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.CUSTOM_AMOUNT
);

customAmountScene.enter(async (ctx) => {
  await ctx.reply(
    `💭 **Enter custom amount**\n\n` +
      `Please enter the amount of SOL you want to add:`,
    { parse_mode: "Markdown" }
  );
});

customAmountScene.on(message("text"), async (ctx) => {
  const input = ctx.message.text;
  const amount = parseFloat(input);

  if (isNaN(amount) || amount <= 0) {
    await ctx.reply("❌ Please enter a valid positive number.");
    return;
  }

  (ctx.scene.state as SceneState).amount = amount;
  return ctx.scene.enter(SCENE_IDS.CONFIRMATION, ctx.scene.state);
});

// Scene: Confirmation
const confirmationScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.CONFIRMATION
);

confirmationScene.enter(async (ctx) => {
  const { strategy, amount, poolInfo, selectedSide } = ctx.scene
    .state as SceneState;

  let message = `🤖 **Confirmation**\n\n`;

  if (strategy === "single") {
    message += `Agent will create a single-sided position by adding ${amount} SOL worth of ${selectedSide} to the ${poolInfo?.token_a_symbol}/${poolInfo?.token_b_symbol} pool.`;
  } else {
    message += `Agent will create a concentrated ${strategy} position in this pool by equally dividing your ${amount} SOL into ${poolInfo?.token_a_symbol} and ${poolInfo?.token_b_symbol}.`;
  }

  await ctx.reply(message, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✅ Yes", "confirm_yes")],
      [Markup.button.callback("❌ No", "confirm_no")],
    ]),
  });
});

confirmationScene.action("confirm_no", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "❌ **Cancelled initialization of the position.**",
    { parse_mode: "Markdown" }
  );
  return ctx.scene.leave();
});

confirmationScene.action("confirm_yes", async (ctx) => {
  await ctx.answerCbQuery();

  const { strategy, amount, poolInfo, selectedSide } = ctx.scene
    .state as SceneState;

  try {
    await ctx.editMessageText("⏳ **Processing transaction...**", {
      parse_mode: "Markdown",
    });

    const result = await positionService.createPosition(
      ctx.user.id,
      poolInfo?.pool_address!,
      "spot",
      Number(amount || 0)
    );

    if (result.success) {
      await ctx.editMessageText(
        `✅ **Transaction Successful!**\n\n` +
          `🎉 Your ${strategy} position has been created successfully.\n` +
          `📝 Transaction: \`${result.transactionId}\`\n\n` +
          `💰 Amount: ${amount} SOL\n` +
          `🏊 Pool: ${poolInfo?.token_a_symbol}/${poolInfo?.token_b_symbol}`,
        { parse_mode: "Markdown" }
      );
    } else {
      throw new Error("Transaction failed");
    }
  } catch (error) {
    await ctx.editMessageText(
      "❌ **Transaction Failed**\n\n" +
        "Something went wrong while creating your position. Please try again later.",
      { parse_mode: "Markdown" }
    );
  }

  return ctx.scene.leave();
});

export const createTradingStage = () => {
  return new Scenes.Stage<any>([
    inputMessageScene,
    strategySelectionScene,
    sideSelectionScene,
    amountInputScene,
    customAmountScene,
    confirmationScene,
  ]);
};

export async function messageHandler(
  ctx: BotContext,
  _server: FastifyInstance
) {
  const messageText =
    ctx.message && "text" in ctx.message ? ctx.message.text : "";

  if (!messageText) {
    return;
  }

  const detection = inputDetectionService.detectInput(messageText);

  if (!detection) {
    return;
  }

  return ctx.scene.enter(SCENE_IDS.TOKEN_INPUT, {
    detection: detection,
  });

  // try {
  //   const loadingMessage = formatLoadingMessage(detection.type);
  //   const sentMessage = await ctx.reply(loadingMessage);

  //   let responseMessage: string;
  //   let type: "token" | "pool" | "unknown" = "unknown";
  //   let poolType: "damm_v1" | "damm_v2" | "dlmm" | undefined;

  //   switch (detection.type) {
  //     case "address":
  //       responseMessage = await handleTokenAddress(detection.value, server);
  //       type = "token";
  //       break;

  //     case "meteora_damm_v1":
  //     case "meteora_damm_v2":
  //     case "meteora_dlmm":
  //       responseMessage = await handleMeteoraPool(detection, server);
  //       type = "pool";
  //       poolType =
  //         inputDetectionService.getMeteoraPoolType(detection.originalInput) ||
  //         undefined;
  //       break;

  //     default:
  //       responseMessage = formatErrorMessage(
  //         messageText,
  //         `Unsupported input type: ${detection.type}`
  //       );
  //   }

  //   await ctx.telegram.editMessageText(
  //     ctx.chat?.id,
  //     sentMessage.message_id,
  //     undefined,
  //     responseMessage,
  //     {
  //       parse_mode: "Markdown",
  //       reply_markup: {
  //         inline_keyboard: getTokenInfoKeyboard(detection.value, type, poolType)
  //           .inline_keyboard,
  //       },
  //     }
  //   );
  // } catch (error) {
  //   server.log.error("Error handling token input:", error);

  //   const errorMessage = formatErrorMessage(
  //     messageText,
  //     "Failed to fetch token/pool information. Please try again later."
  //   );

  //   await ctx.reply(errorMessage, { parse_mode: "Markdown" });
  // }
}
