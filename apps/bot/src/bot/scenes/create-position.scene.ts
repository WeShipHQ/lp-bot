import { Scenes, Markup } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import {
  MeteoraCreatePositionStrategy,
  MeteoraPoolData,
} from "@/types/meteora.types";
import { poolService } from "@/services/pool.service";
import { jupiterService } from "@/services/jupiter.service";
import { meteoraDlmmService } from "@/services/meteora/dlmm.service";
import { SOL_MINT } from "@/config/constants";
import { formatNumber, formatPercentage } from "../utils/formatters";
import { divider } from "../utils/text-formatters";
import { message } from "telegraf/filters";
import { BUFFER_AMOUNT, OPEN_POSITION_FEE } from "../config/constants";
import { solanaService } from "@/services/solana.service";
import { positionService } from "@/services/position.service";

type WizardState = {
  step?:
    | "welcome"
    | "strategy_selection"
    | "side_selection"
    | "amount"
    | "custom_amount"
    | "confirm";
  poolAddress?: string;
  poolData?: MeteoraPoolData;
  strategy?: MeteoraCreatePositionStrategy;
  side?: "X" | "Y";
  amount?: number;
  autoRebalancing?: "yes" | "no";
  awaitingCustomAmount?: boolean;
  enteredCustomAmount?: boolean;
  messageId?: number;
};

// async function executeCreatePosition(ctx: BotContext) {
//   const { strategy, side, amount, poolData } = ctx.wizard.state as WizardState;
//   try {
//     // Simulate position creation - replace with real Meteora/Solana integration
//     await delay(1000);
//     return { success: true, txId: "dummy_tx_" + Date.now() };
//   } catch (error) {
//     return { success: false, error: (error as Error).message };
//   }
// }

function generateProgressMessage(
  poolData: MeteoraPoolData,
  state: WizardState,
  currentStep: string,
  guide?: string
): string {
  const verifiedEmoji = poolData.tokens_verified ? "✅" : "⚠️";

  let message =
    `*${poolData.pool_name}* ${verifiedEmoji}\n` +
    `Pool Price: *${formatNumber(poolData.pool_price)} ${poolData.token_a_symbol}/${poolData.token_b_symbol}*\n` +
    `TVL: *$${formatNumber(poolData.liquidity)}*\n` +
    `Fee/TVL: *${formatPercentage(poolData.fee_tvl_ratio)}*\n`;

  const hasSelected = state.strategy || state.side || state.amount;

  if (hasSelected) {
    message += `${divider()}\n`;
    message += `*Your Selections:*\n`;

    // Strategy
    if (state.strategy) {
      message += `Strategy: *${state.strategy.toUpperCase()}*\n`;
    } else {
      message += `Strategy: *Not selected*\n`;
    }

    // Side (for single-sided)
    if (state.strategy === "single-sided") {
      if (state.side) {
        const tokenName =
          state.side === "X"
            ? poolData.token_a_symbol
            : poolData.token_b_symbol;
        message += `Token: *${tokenName}*\n`;
      } else {
        message += `Token: *Not selected*\n`;
      }
    }

    // Amount
    if (state.amount) {
      message += `Amount: *${state.amount} SOL*\n`;
    } else {
      message += `Amount: *Not selected*\n`;
    }

    // Auto-rebalancing
    if (state.autoRebalancing) {
      message += `Auto-rebalancing: ${state.autoRebalancing === "yes" ? "✅" : "❌"}\n`;
    }
  }

  message += divider();
  message += `\n`;

  // Current step guide
  message += `*${currentStep}*\n\n`;
  if (guide) {
    message += `${guide}\n\n`;
  }

  console.log("xxxx", message);

  return message;
}

function generatePositionSummary(
  state: WizardState,
  preview: {
    rangeMin: string;
    rangeMax: string;
    tokenAAmount: string;
    tokenBAmount: string;
    autoRebalancing: boolean;
  }
): string {
  const { strategy, side, amount, poolData, autoRebalancing } = state;

  const verifiedEmoji = poolData?.tokens_verified ? "✅" : "⚠️";

  let message =
    `📋 *Position Summary*\n\n` +
    `Pool: *${poolData?.pool_name}* ${verifiedEmoji}\n`;
  if (strategy === "single-sided") {
    message += `Strategy: *${strategy!.toUpperCase()}${side ? ` (${side === "X" ? poolData!.token_a_symbol : poolData!.token_b_symbol})` : ""}*\n`;
    message += `Position Range: ${preview.rangeMin} - ${preview.rangeMax} ${poolData?.token_b_symbol} / ${poolData?.token_a_symbol}\n`;
    message += `Amount: ${preview.tokenAAmount} ${poolData?.token_a_symbol} / ${preview.tokenBAmount} ${poolData?.token_b_symbol}\n`;
  } else {
    message += `Strategy: *${strategy!.toUpperCase()}${side ? ` (${side === "X" ? poolData!.token_a_symbol : poolData!.token_b_symbol})` : ""}*\n`;
    message += `Position Range: *${formatNumber(preview.rangeMin, { maxDecimals: 6 })} - ${formatNumber(preview.rangeMax, { maxDecimals: 6 })} ${poolData?.token_b_symbol} / ${poolData?.token_a_symbol}*\n`;
    message += `Amount: *${formatNumber(preview.tokenAAmount, { maxDecimals: 6 })} ${poolData?.token_a_symbol} / ${formatNumber(preview.tokenBAmount, { maxDecimals: 6 })} ${poolData?.token_b_symbol}*\n`;
    message += `Auto-rebalancing: *${autoRebalancing === "yes" ? "Enabled" : "Disabled"}*\n\n`;
  }

  message += "*Create position by confirming on the button below*";

  return message;
}

export const createPositionScene = new Scenes.WizardScene<BotContext>(
  SCENE_IDS.CREATE_POSITION_SCENE,

  // Step 0: Entry/Welcome & Strategy Selection
  async (ctx) => {
    try {
      const { poolAddress } = ctx.wizard.state as WizardState;

      if (!poolAddress) {
        await ctx.reply(
          MessageService.getErrorMessage("Pool address not found")
        );
        return ctx.scene.leave();
      }

      const poolData = await poolService.getPool(poolAddress, "dlmm");
      if (!poolData) {
        await ctx.reply(MessageService.getErrorMessage("Pool not found"));
        return ctx.scene.leave();
      }

      // Store pool data in wizard state
      (ctx.scene.state as WizardState).poolData = poolData;
      (ctx.scene.state as WizardState).step = "strategy_selection";

      const message = generateProgressMessage(
        poolData,
        ctx.scene.state as WizardState,
        "Choose Strategy",
        `*Spot*: Provide liquidity around current price\n` +
          `*Curve*: Auto-rebalancing across price range\n` +
          `*Single-Sided*: Deposit into one token only`
      );

      const msg = await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("Spot", "strategy:spot"),
            Markup.button.callback("Curve", "strategy:curve"),
          ],
          [Markup.button.callback("Single-sided", "strategy:single-sided")],
          [Markup.button.callback("❌ Cancel", "cancel")],
        ])
      );
      (ctx.scene.state as WizardState).messageId = msg.message_id;
    } catch (error) {
      console.error("Error in create position scene:", error);
      await ctx.reply(
        MessageService.getErrorMessage("Failed to load strategy options")
      );
      return ctx.scene.leave();
    }
  },

  // Step 1: Side Selection (conditional for single-sided)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { strategy, poolData } = state;

    if (strategy !== "single-sided") {
      ctx.wizard.next(); // Skip to amount if not single-sided
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const message = generateProgressMessage(
      poolData!,
      state,
      "Choose Token",
      "Single-sided strategy allows you to provide only one token. Choose which token you want to deposit."
    );

    (ctx.scene.state as WizardState).step = "side_selection";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(`${poolData!.token_a_symbol}`, "side:X"),
          Markup.button.callback(`${poolData!.token_b_symbol}`, "side:Y"),
        ],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 2: Amount Selection/Input
  async (ctx) => {
    const user = ctx.user;
    const balance = await solanaService.getBalance(user.walletAddress!);

    const state = ctx.scene.state as WizardState;
    const { poolData } = state;

    (ctx.scene.state as WizardState).step = "amount";

    const message = generateProgressMessage(
      poolData!,
      state,
      "Choose Amount",
      "How much SOL would you like to add to the pool? We'll split it evenly between the two tokens for balanced liquidity. Pick a preset amount or type in your own.\n" +
        `Current SOL balance: *${formatNumber(balance, { maxDecimals: 6 })} SOL*`
    );

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("0.1 SOL", "amount:0.1"),
          Markup.button.callback("1 SOL", "amount:1"),
          Markup.button.callback("5 SOL", "amount:5"),
        ],
        [Markup.button.callback("✏️ Custom", "amount:custom")],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 3: Split Notification & Confirmation (conditional for spot/curve)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { strategy, poolData } = state;

    if (strategy === "single-sided") {
      ctx.wizard.next(); // Skip to summary for single-sided
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const message = generateProgressMessage(
      poolData!,
      state,
      "Auto-rebalancing",
      "Would you like to enable auto-rebalancing and monitoring every 1 hr?"
    );

    if (state.enteredCustomAmount) {
      return ctx.reply(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Yes", "rebalance:yes"),
            Markup.button.callback("❌ No", "rebalance:no"),
          ],
          [
            Markup.button.callback("🔙 Back", "back"),
            Markup.button.callback("❌ Cancel", "cancel"),
          ],
        ]),
      });
    }

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Yes", "rebalance:yes"),
          Markup.button.callback("❌ No", "rebalance:no"),
        ],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 4: Summary & Final Confirmation
  async (ctx) => {
    const { strategy, side, amount, poolData } = ctx.scene.state as WizardState;

    try {
      if (!strategy || !amount || !poolData) {
        await ctx.reply("❌ Pool data not available.");
        return ctx.scene.leave();
      }

      const preview = await calculatePositionPreview(
        strategy,
        amount,
        poolData,
        side
      );

      const summary = generatePositionSummary(ctx.scene.state, preview);

      return ctx.editMessageText(summary, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("🚀 Yes, Create Position", "confirm:yes"),
            Markup.button.callback("🔙 No (Back)", "back"),
          ],
          [Markup.button.callback("❌ Cancel", "cancel")],
        ]),
      });
    } catch (error) {
      console.error("Error calculating summary:", error);
      await ctx.reply(
        "❌ Error calculating position summary. Please try again."
      );
      return ctx.wizard.back();
    }
  },

  // Step 5: Execution
  async (ctx) => {
    await ctx.editMessageText(
      "⏳ *Creating position...*\n\nThis may take a few moments.",
      { parse_mode: "Markdown" }
    );

    const { strategy, amount, poolData } = ctx.scene.state as WizardState;

    const result = await positionService.createPosition(
      ctx.user,
      poolData?.pool_address!,
      strategy!,
      Number(amount || 0)
    );

    // const result = await executeCreatePosition(ctx);

    if (result.success) {
      await ctx.editMessageText(
        `🎉 *Position Created Successfully!*\n\n` +
          `📊 *Transaction*: \`${result.transactionId}\`\n\n` +
          `You can view your position in the portfolio section.`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.editMessageText(
        `❌ *Position Creation Failed*\n\n` +
          `Error: ${result.error}\n\n` +
          `Please try again or contact support.`,
        { parse_mode: "Markdown" }
      );
    }

    return ctx.scene.leave();
  }
);

createPositionScene.action(
  /strategy:(spot|curve|single-sided)/,
  async (ctx, next) => {
    await ctx.answerCbQuery();
    const state = ctx.scene.state as WizardState;
    state.strategy = ctx.match[1] as "spot" | "curve" | "single-sided";

    const message = generateProgressMessage(
      state.poolData!,
      state,
      "Strategy Selected",
      `You selected ${ctx.match[1].toUpperCase()} strategy. ${getStrategyGuide(ctx.match[1])}`
    );

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
    });

    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      ctx.wizard.step(ctx, next);
    }
  }
);

createPositionScene.action(/side:(X|Y)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const state = ctx.scene.state as WizardState;
  state.side = ctx.match[1] as "X" | "Y";

  const tokenName =
    ctx.match[1] === "X"
      ? state.poolData!.token_a_symbol
      : state.poolData!.token_b_symbol;

  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Token Selected",
    `You selected ${tokenName}. You'll provide liquidity using only this token.`
  );

  await ctx.editMessageText(message, { parse_mode: "Markdown" });

  setTimeout(() => {
    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      ctx.wizard.step(ctx, next);
    }
  }, 0);
});

createPositionScene.action(/amount:(\d+\.?\d*)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const amount = parseFloat(ctx.match[1]);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount. Try again.");
  }

  const user = ctx.user;
  const balance = await solanaService.getBalance(user.walletAddress!);
  const recommendAmount = amount + BUFFER_AMOUNT;

  if (recommendAmount > balance) {
    return ctx.replyWithMarkdown(
      `❌ Insufficient SOL balance to create position. Current balance - *${formatNumber(balance, { maxDecimals: 6 })} SOL* and required - *${formatNumber(recommendAmount, { maxDecimals: 6 })} SOL*`
    );
  }

  const state = ctx.scene.state as WizardState;
  state.amount = amount;

  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Amount Selected",
    `You selected ${amount} SOL. ${getAmountGuide(amount)}`
  );

  await ctx.editMessageText(message, { parse_mode: "Markdown" });

  setTimeout(() => {
    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      ctx.wizard.step(ctx, next);
    }
  }, 0);
});

function getStrategyGuide(strategy: string): string {
  switch (strategy) {
    case "spot":
      return "Your funds will be split 50/50 between both tokens at current market price.";
    case "curve":
      return "Your position will be optimized based on the price curve for better capital efficiency.";
    case "single-sided":
      return "You can provide liquidity using only one token, reducing complexity.";
    default:
      return "";
  }
}

function getAmountGuide(amount: number): string {
  if (amount < 0.5) {
    return "⚠️ Small amounts may have higher relative fees.";
  } else if (amount > 10) {
    return "💡 Large amounts provide more liquidity but higher exposure to impermanent loss.";
  }
  return "✅ Good amount for testing the strategy.";
}

createPositionScene.action("amount:custom", async (ctx) => {
  await ctx.answerCbQuery();
  // const state = ctx.scene.state as WizardState;

  // const message = generateProgressMessage(
  //   state.poolData!,
  //   state,
  //   "Amount Selected",
  //   "Enter your custom amount in SOL (e.g., 2.5):"
  // );

  await ctx.replyWithMarkdown(
    "*Enter your custom amount in SOL* (e.g., 2.5):",
    {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
      },
    }
  );
  // await ctx.editMessageText(message, { parse_mode: "Markdown" });

  (ctx.scene.state as WizardState).awaitingCustomAmount = true;
  // Stay in current step - don't advance
});

createPositionScene.action(/rebalance:(yes)/, async (ctx, next) => {
  await ctx.answerCbQuery();

  (ctx.scene.state as WizardState).autoRebalancing = "yes";

  await ctx.editMessageText("✅ *Auto-rebalancing enabled*", {
    parse_mode: "Markdown",
  });

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    return ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action(/rebalance:(no)/, async (ctx, next) => {
  await ctx.answerCbQuery();

  (ctx.scene.state as WizardState).autoRebalancing = "no";

  await ctx.editMessageText("❌ *Auto-rebalancing disabled*", {
    parse_mode: "Markdown",
  });

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    return ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action("confirm:yes", async (ctx, next) => {
  await ctx.answerCbQuery();
  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    return ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action("back", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.wizard.back();
});

createPositionScene.action("cancel", async (ctx) => {
  // await ctx.answerCbQuery();
  await ctx.deleteMessage();
  // await ctx.reply(
  //   "❌ **Position creation cancelled**\n\nYou can start over anytime!",
  //   { parse_mode: "Markdown" }
  // );
  return ctx.scene.leave();
});

// Handle text inputs (for custom amount)
createPositionScene.on(message("text"), async (ctx, next) => {
  const state = ctx.scene.state as WizardState;

  if (state.awaitingCustomAmount) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.editMessageText(
        "❌ Invalid amount. Enter a positive number (e.g., 2.5)."
      );
    }
    (ctx.scene.state as WizardState).amount = amount;
    (ctx.scene.state as WizardState).awaitingCustomAmount = false;
    (ctx.scene.state as WizardState).enteredCustomAmount = true;

    console.log(ctx.message);

    if (ctx.message.reply_to_message?.message_id) {
      await ctx.deleteMessage(ctx.message.reply_to_message?.message_id);
    }

    if (state.messageId) {
      await ctx.deleteMessage(state.messageId);
    }

    await ctx.deleteMessage();

    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      return ctx.wizard.step(ctx, next);
    }
  }
});

// @ts-expect-error
createPositionScene.command("back", (ctx: BotContext) => ctx.wizard.back());

createPositionScene.command("cancel", async (ctx) => {
  await ctx.deleteMessage();
  return ctx.scene.leave();
});

async function calculatePositionPreview(
  strategy: MeteoraCreatePositionStrategy,
  enteredAmount: number,
  poolInfo: MeteoraPoolData,
  selectedSide?: string
) {
  const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
  const amount = enteredAmount - feeAmount;

  // For single-sided strategy
  if (strategy === "single-sided") {
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

  console.log("price range: ", fromPrice, toPrice);

  return {
    rangeMin: fromPrice,
    rangeMax: toPrice,
    tokenAAmount,
    tokenBAmount,
    autoRebalancing: strategy === "curve" || strategy === "spot",
  };
}
