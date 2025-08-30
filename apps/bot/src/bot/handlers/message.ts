import { Markup, Scenes } from "telegraf";
import { FastifyInstance } from "fastify";
import { inputDetectionService } from "../../services/input-detection.service";
import { jupiterService } from "../../services/jupiter.service";
import { meteoraPoolService } from "../../services/meteora/pool.service";
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
import { SCENE_IDS } from "../config/scenes";

type SceneState = {
  detection: TokenInputDetection;
  tokenInfo?: TokenInfo;
  poolInfo?: MeteoraPoolData;
  strategy?: any;
  selectedSide?: any;
  amount?: number;
};

export const inputMessageScene = new Scenes.BaseScene<BotContext>(
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
      const poolData = await meteoraPoolService.getPoolInfo(
        detection.value,
        poolType
      );

      if (!poolData) {
        responseMessage = formatErrorMessage(
          detection.originalInput,
          "Pool not found or invalid pool ID"
        );
      } else {
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
export const strategySelectionScene = new Scenes.BaseScene<BotContext>(
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
export const sideSelectionScene = new Scenes.BaseScene<BotContext>(
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
export const amountInputScene = new Scenes.BaseScene<BotContext>(
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
export const customAmountScene = new Scenes.BaseScene<BotContext>(
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
export const confirmationScene = new Scenes.BaseScene<BotContext>(
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
  return ctx.scene.enter(SCENE_IDS.POSITION_PREVIEW, ctx.scene.state);
});

// Scene: Position Preview
export const positionPreviewScene = new Scenes.BaseScene<BotContext>(
  SCENE_IDS.POSITION_PREVIEW
);

positionPreviewScene.enter(async (ctx) => {
  const { strategy, amount, poolInfo, selectedSide } = ctx.scene
    .state as SceneState;

  // Show loading message first
  await ctx.editMessageText("⏳ **Calculating position preview...**", {
    parse_mode: "Markdown",
  });

  try {
    // Calculate position preview
    const preview = await calculatePositionPreview(
      strategy,
      amount || 0,
      poolInfo!,
      selectedSide
    );

    let message = `👀 **Position Preview**\n\n`;
    message += `Strategy: ${strategy.toUpperCase()}\n`;
    message += `Pool: ${poolInfo?.token_a_symbol}-${poolInfo?.token_b_symbol}\n`;

    if (strategy !== "single") {
      message += `Position Range: ${preview.rangeMin} - ${preview.rangeMax} ${poolInfo?.token_b_symbol} / ${poolInfo?.token_a_symbol}\n`;
      message += `Amount: ${preview.tokenAAmount} ${poolInfo?.token_a_symbol} / ${preview.tokenBAmount} ${poolInfo?.token_b_symbol}\n`;
      if (preview.autoRebalancing) {
        message += `Auto-rebalancing: enabled\n`;
      }
    } else {
      message += `Side: ${selectedSide}\n`;
      if (selectedSide === poolInfo?.token_a_symbol) {
        message += `Amount: ${preview.tokenAAmount} ${poolInfo?.token_a_symbol}\n`;
      } else {
        message += `Amount: ${preview.tokenBAmount} ${poolInfo?.token_b_symbol}\n`;
      }
    }

    message += `\nCreate position by confirming on the button below`;

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Yes", "final_confirm_yes")],
        [Markup.button.callback("❌ No", "final_confirm_no")],
      ]),
    });
  } catch (error) {
    console.error("Error calculating position preview:", error);
    await ctx.editMessageText(
      "❌ **Error calculating position preview**\n\nPlease try again later.",
      { parse_mode: "Markdown" }
    );
    return ctx.scene.leave();
  }
});

positionPreviewScene.action("final_confirm_no", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "❌ **Cancelled initialization of the position.**",
    { parse_mode: "Markdown" }
  );
  return ctx.scene.leave();
});

positionPreviewScene.action("final_confirm_yes", async (ctx) => {
  await ctx.answerCbQuery();

  const { strategy, amount, poolInfo, selectedSide } = ctx.scene
    .state as SceneState;

  try {
    // Send new message instead of editing
    await ctx.reply("⏳ **Processing transaction...**", {
      parse_mode: "Markdown",
    });

    const result = await positionService.createPosition(
      ctx.user,
      poolInfo?.pool_address!,
      "spot",
      Number(amount || 0)
    );

    if (result.success) {
      await ctx.reply(
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
    await ctx.reply(
      "❌ **Transaction Failed**\n\n" +
        "Something went wrong while creating your position. Please try again later.",
      { parse_mode: "Markdown" }
    );
  }

  return ctx.scene.leave();
});

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
}

async function calculatePositionPreview(
  strategy: string,
  amount: number,
  poolInfo: MeteoraPoolData,
  selectedSide?: string
) {
  const SOL_MINT = "So11111111111111111111111111111111111111112";

  // For single-sided strategy
  if (strategy === "single") {
    if (selectedSide === poolInfo.token_a_symbol) {
      // Converting SOL to token A
      if (poolInfo.token_a_mint === SOL_MINT) {
        return {
          rangeMin: "N/A",
          rangeMax: "N/A",
          tokenAAmount: amount.toString(),
          tokenBAmount: "0",
          autoRebalancing: false,
        };
      } else {
        try {
          const orderResponse = await jupiterService.getOrder({
            inputMint: SOL_MINT,
            outputMint: poolInfo.token_a_mint,
            amount: (amount * 1e9).toString(), // Convert SOL to lamports
          });
          // TODO fix decimals
          const tokenAAmount = (
            parseInt(orderResponse.outAmount) / Math.pow(10, 6)
          ).toString();

          return {
            rangeMin: "N/A",
            rangeMax: "N/A",
            tokenAAmount,
            tokenBAmount: "0",
            autoRebalancing: false,
          };
        } catch (error) {
          console.error("Error getting Jupiter quote for token A:", error);
          return {
            rangeMin: "N/A",
            rangeMax: "N/A",
            tokenAAmount: "Error calculating",
            tokenBAmount: "0",
            autoRebalancing: false,
          };
        }
      }
    } else {
      if (poolInfo.token_b_mint === SOL_MINT) {
        return {
          rangeMin: "N/A",
          rangeMax: "N/A",
          tokenAAmount: "0",
          tokenBAmount: amount.toString(),
          autoRebalancing: false,
        };
      } else {
        try {
          const orderResponse = await jupiterService.getOrder({
            inputMint: SOL_MINT,
            outputMint: poolInfo.token_b_mint,
            amount: (amount * 1e9).toString(), // Convert SOL to lamports
          });

          const tokenBAmount = (
            parseInt(orderResponse.outAmount) / Math.pow(10, 6)
          ).toString();

          return {
            rangeMin: "N/A",
            rangeMax: "N/A",
            tokenAAmount: "0",
            tokenBAmount,
            autoRebalancing: false,
          };
        } catch (error) {
          console.error("Error getting Jupiter quote for token B:", error);
          return {
            rangeMin: "N/A",
            rangeMax: "N/A",
            tokenAAmount: "0",
            tokenBAmount: "Error calculating",
            autoRebalancing: false,
          };
        }
      }
    }
  }

  // For spot and curve strategies, split amount 50/50
  const halfAmount = amount / 2;
  const halfAmountLamports = (halfAmount * 1e9).toString();

  let tokenAAmount = "0";
  let tokenBAmount = "0";

  try {
    // Calculate token A amount
    if (poolInfo.token_a_mint === SOL_MINT) {
      // Token A is SOL, no conversion needed
      tokenAAmount = halfAmount.toString();
    } else {
      // Convert SOL to token A
      const orderResponseA = await jupiterService.getOrder({
        inputMint: SOL_MINT,
        outputMint: poolInfo.token_a_mint,
        amount: halfAmountLamports,
      });

      tokenAAmount = (
        parseInt(orderResponseA.outAmount) / Math.pow(10, 6)
      ).toFixed(6);
    }

    // Calculate token B amount
    if (poolInfo.token_b_mint === SOL_MINT) {
      // Token B is SOL, no conversion needed
      tokenBAmount = halfAmount.toString();
    } else {
      // Convert SOL to token B
      const orderResponseB = await jupiterService.getOrder({
        inputMint: SOL_MINT,
        outputMint: poolInfo.token_b_mint,
        amount: halfAmountLamports,
      });

      tokenBAmount = (
        parseInt(orderResponseB.outAmount) / Math.pow(10, 6)
      ).toFixed(6);
    }
  } catch (error) {
    console.error("Error getting Jupiter quotes:", error);
    tokenAAmount = "Error calculating";
    tokenBAmount = "Error calculating";
  }

  const { fromPrice, toPrice } = await meteoraDlmmService.getPriceRange(
    poolInfo.pool_address
  );

  return {
    rangeMin: fromPrice,
    rangeMax: toPrice,
    tokenAAmount,
    tokenBAmount,
    autoRebalancing: strategy === "curve" || strategy === "spot",
  };
}
