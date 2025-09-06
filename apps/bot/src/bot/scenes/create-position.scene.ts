import { Scenes, Markup } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MessageService } from "@/services/message.service";
import { MeteoraCreatePositionStrategy } from "@/types/meteora.types";
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
import { Pool } from "@/types/pool.types";

type WizardState = {
  step?:
    | "welcome"
    | "strategy_selection"
    | "deposit_method"
    | "token_selection"
    | "deposit_source"
    | "amount"
    | "percentage"
    | "custom_amount"
    | "price_change_selection"
    | "confirm";
  poolAddress?: string;
  poolData?: Pool;
  strategy?: MeteoraCreatePositionStrategy;
  depositMethod?: "sol_auto_convert" | "single_sided";
  selectedToken?: string;
  depositSource?: "sol_convert" | "token_balance";
  amount?: number;
  percentage?: number;
  priceChangePercentage?: number;
  autoRebalancing?: "yes" | "no";
  awaitingCustomAmount?: boolean;
  awaitingCustomPriceChange?: boolean;
  enteredCustomAmount?: boolean;
  messageId?: number;
};

// Mock function for getting token balance
async function getTokenBalance(
  walletAddress: string,
  tokenMint: string
): Promise<number> {
  // Mock implementation - replace with actual token balance service
  return Math.random() * 1000; // Random balance for demo
}

function generateProgressMessage(
  poolData: Pool,
  state: WizardState,
  currentStep: string,
  guide?: string
): string {
  const { poolData: _p, ...rest } = state;
  (console.log("state: ", rest), _p?.liquidity);
  const verifiedEmoji = poolData.isVerified ? "✅" : "⚠️";

  let message =
    `*${poolData.name}* ${verifiedEmoji}\n` +
    `Pool Price: *${formatNumber(poolData.currentPrice)} ${poolData.tokenA.symbol}/${poolData.tokenB.symbol}*\n` +
    `TVL: *$${formatNumber(poolData.liquidity)}*\n` +
    `Fee/TVL: *${formatPercentage(poolData.feeTvlRatio.hour24)}*\n`;

  const hasSelected =
    state.strategy ||
    state.depositMethod ||
    state.selectedToken ||
    state.amount;

  if (hasSelected) {
    message += `${divider()}\n`;
    message += `*Your Selections:*\n`;

    // Strategy
    if (state.strategy) {
      message += `Strategy: *${state.strategy.toUpperCase()}*\n`;
    } else {
      message += `Strategy: *Not selected*\n`;
    }

    // Deposit Method
    if (state.depositMethod) {
      const methodName =
        state.depositMethod === "sol_auto_convert"
          ? "SOL Auto-convert"
          : "Single-sided Token";
      message += `Deposit Method: *${methodName}*\n`;
    }

    // Selected Token (for single-sided)
    if (state.depositMethod === "single_sided" && state.selectedToken) {
      const tokenName =
        state.selectedToken === poolData.tokenA.address
          ? poolData.tokenA.symbol
          : poolData.tokenB.symbol;
      message += `Token: *${tokenName}*\n`;
    }

    // Deposit Source (for single-sided)
    if (state.depositSource) {
      const sourceName =
        state.depositSource === "sol_convert"
          ? "Convert from SOL"
          : "From Token Balance";
      message += `Source: *${sourceName}*\n`;
    }

    // Amount or Percentage
    if (state.amount) {
      message += `Amount: *${state.amount} SOL*\n`;
    } else if (state.percentage) {
      message += `Percentage: *${state.percentage}%*\n`;
    }

    // Price Change Coverage (for single-sided)
    if (state.depositMethod === "single_sided" && state.priceChangePercentage) {
      message += `Price Change Coverage: *${state.priceChangePercentage}%*\n`;
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

  return message;
}

function generatePositionSummary(
  state: WizardState,
  preview: {
    rangeMin: string;
    rangeMax: string;
    tokenAAmount: number;
    tokenBAmount: number;
  }
): string {
  const {
    strategy,
    depositMethod,
    selectedToken,
    amount,
    percentage,
    poolData,
    autoRebalancing,
  } = state;

  const verifiedEmoji = poolData?.isVerified ? "✅" : "⚠️";

  let message =
    `*Position Summary*\n\n` + `Pool: *${poolData?.name}* ${verifiedEmoji}\n`;

  message += `Strategy: *${strategy!.toUpperCase()}*\n`;

  if (depositMethod === "single_sided") {
    const tokenName =
      selectedToken === poolData!.tokenA.address
        ? poolData!.tokenA.symbol
        : poolData!.tokenB.symbol;
    message += `Deposit Method: *Single-sided (${tokenName})*\n`;
    if (percentage) {
      message += `Amount: *${percentage}% of token balance*\n`;
    } else {
      message += `Amount: *${amount} SOL (converted)*\n`;
    }
  } else {
    message += `Deposit Method: *SOL Auto-convert*\n`;
    message += `Amount: *${amount} SOL*\n`;
  }

  message += `Position Range: *${formatNumber(preview.rangeMin, { maxDecimals: 6 })} - ${formatNumber(preview.rangeMax, { maxDecimals: 6 })} ${poolData?.tokenB.symbol} / ${poolData?.tokenA.symbol}*\n`;
  message += `Tokens: *${formatNumber(preview.tokenAAmount, { maxDecimals: 6 })} ${poolData?.tokenA.symbol} / ${formatNumber(preview.tokenBAmount, { maxDecimals: 6 })} ${poolData?.tokenB.symbol}*\n`;

  if (depositMethod === "sol_auto_convert") {
    message += `Auto-rebalancing: *${autoRebalancing === "yes" ? "Enabled" : "Disabled"}*\n\n`;
  }

  message += "*Create position by confirming on the button below*";

  return message;
}

// Add this function before the createPositionScene definition
async function getPoolTokenBalances(
  walletAddress: string,
  poolData: Pool
): Promise<{ tokenABalance: number; tokenBBalance: number }> {
  let tokenABalance = 0;
  let tokenBBalance = 0;

  // Get Token A balance
  if (poolData.tokenA.address === SOL_MINT) {
    tokenABalance = await solanaService.getBalance(walletAddress);
  } else {
    const result = await solanaService.getTokenBalance(
      walletAddress,
      poolData.tokenA.address
    );
    tokenABalance = result.balance;
  }

  // Get Token B balance
  if (poolData.tokenB.address === SOL_MINT) {
    tokenBBalance = await solanaService.getBalance(walletAddress);
  } else {
    const result = await solanaService.getTokenBalance(
      walletAddress,
      poolData.tokenB.address
    );
    tokenBBalance = result.balance;
  }

  return { tokenABalance, tokenBBalance };
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

      const poolData = await poolService.getPoolV2(poolAddress);
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
        `*Spot*: Even liquidity spread, flexible for all markets, beginner-friendly, less rebalancing needed.\n` +
          `*Curve*: Liquidity centered in middle, efficient for stable pairs with minimal price changes.\n` +
          `*Bid-ask*: Liquidity at range ends—for big volatility, complex but high-fee potential, good for single-sided DCA.`
      );

      const msg = await ctx.replyWithMarkdown(
        message,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("Spot", "strategy:spot"),
            Markup.button.callback("Curve", "strategy:curve"),
          ],
          [Markup.button.callback("Bid-ask", "strategy:bid-ask")],
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

  // Step 1: Deposit Method Selection
  async (ctx) => {
    const state = ctx.scene.state as WizardState;
    const { poolData } = state;

    const message = generateProgressMessage(
      poolData!,
      state,
      "Choose how to add liquidity",
      "*Balanced*: Deposit SOL only, it gets automatically swapped and split evenly between the two tokens for a balanced position\n" +
        "*Single-sided*: Deposit just one token to add liquidity on that side"
    );

    (ctx.scene.state as WizardState).step = "deposit_method";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("Balanced", "deposit:sol_auto_convert"),
          Markup.button.callback("Single-sided", "deposit:single_sided"),
        ],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 2: Token Selection (conditional for single-sided)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { depositMethod, poolData } = state;

    if (!poolData || !depositMethod) {
      console.log("poolData", poolData);
      console.log("depositMethod", depositMethod);
      await ctx.reply(MessageService.getErrorMessage("Unknown error"));
      return ctx.scene.leave();
    }

    if (depositMethod !== "single_sided") {
      ctx.wizard.next(); // Skip to amount if SOL auto-convert
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const { tokenABalance, tokenBBalance } = await getPoolTokenBalances(
      ctx.user.walletAddress!,
      poolData
    );

    const message = generateProgressMessage(
      poolData!,
      state,
      "Choose Token",
      "Select which token you want to deposit for single-sided liquidity provision.\n\n" +
        "Current token balances:\t" +
        `*${poolData.tokenA.symbol}*: ${formatNumber(tokenABalance, { maxDecimals: 6 })} ${poolData.tokenA.symbol}\t|\t` +
        `*${poolData.tokenB.symbol}*: ${formatNumber(tokenBBalance, { maxDecimals: 6 })} ${poolData.tokenB.symbol}`
    );

    (ctx.scene.state as WizardState).step = "token_selection";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            `${poolData.tokenA.symbol}`,
            `token:${poolData.tokenA.address}`
          ),
          Markup.button.callback(
            `${poolData.tokenB.symbol}`,
            `token:${poolData.tokenB.address}`
          ),
        ],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 3: Deposit Source Selection (conditional for single-sided)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { depositMethod, poolData } = state;

    if (!poolData) {
      console.log("poolData", poolData);
      await ctx.reply(MessageService.getErrorMessage("Unknown error"));
      return ctx.scene.leave();
    }

    if (depositMethod !== "single_sided") {
      ctx.wizard.next(); // Skip if not single-sided
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const { tokenABalance, tokenBBalance } = await getPoolTokenBalances(
      ctx.user.walletAddress!,
      poolData
    );

    const message = generateProgressMessage(
      poolData!,
      state,
      "Choose Deposit Source",
      "*Convert from SOL*: Enter SOL amount to convert to selected token\n" +
        "*From Token Balance*: Use existing token balance with percentage selection\n\n" +
        "Current token balances:\t" +
        `*${formatNumber(tokenABalance, { maxDecimals: 6 })} ${poolData.tokenA.symbol}*\t|\t` +
        `*${formatNumber(tokenBBalance, { maxDecimals: 6 })} ${poolData.tokenB.symbol}*`
    );

    (ctx.scene.state as WizardState).step = "deposit_source";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("💱 Convert from SOL", "source:sol_convert")],
        [
          Markup.button.callback(
            "💰 From Token Balance",
            "source:token_balance"
          ),
        ],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 4: Amount/Percentage Selection
  async (ctx) => {
    const user = ctx.user;
    const state = ctx.scene.state as WizardState;
    const { depositMethod, depositSource, selectedToken, poolData } = state;

    if (!poolData) {
      console.log("selectedToken", selectedToken);
      console.log("poolData", poolData);
      await ctx.reply(MessageService.getErrorMessage("Unknown error"));
      return ctx.scene.leave();
    }

    (ctx.scene.state as WizardState).step = "amount";

    if (depositMethod === "single_sided" && depositSource === "token_balance") {
      if (!selectedToken) {
        await ctx.reply(MessageService.getErrorMessage("Unknown error"));
        return ctx.scene.leave();
      }

      const tokenBalance = await getTokenBalance(
        user.walletAddress!,
        selectedToken
      );
      const tokenSymbol =
        selectedToken === poolData.tokenA.address
          ? poolData.tokenA.symbol
          : poolData.tokenB.symbol;

      const message = generateProgressMessage(
        poolData!,
        state,
        "Choose Percentage",
        `Select what percentage of your ${tokenSymbol} balance to deposit.\n` +
          `Current ${tokenSymbol} balance: *${formatNumber(tokenBalance, { maxDecimals: 6 })} ${tokenSymbol}*`
      );

      return ctx.editMessageText(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("25%", "percentage:25"),
            Markup.button.callback("50%", "percentage:50"),
            Markup.button.callback("100%", "percentage:100"),
          ],
          [
            Markup.button.callback("🔙 Back", "back"),
            Markup.button.callback("❌ Cancel", "cancel"),
          ],
        ]),
      });
    } else {
      // Show SOL amount options
      const balance = await solanaService.getBalance(user.walletAddress!);
      const guide =
        depositMethod === "sol_auto_convert"
          ? "How much SOL would you like to add to the pool? We'll split it evenly between the two tokens for balanced liquidity."
          : "How much SOL would you like to convert to the selected token?";

      const message = generateProgressMessage(
        poolData!,
        state,
        "Choose Amount",
        `${guide}\n\n` +
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
    }
  },

  // Step 5: Price Change Coverage (conditional for single-sided)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { depositMethod, poolData } = state;

    if (depositMethod !== "single_sided") {
      ctx.wizard.next(); // Skip to auto-rebalancing for SOL auto-convert
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const message = generateProgressMessage(
      poolData!,
      state,
      "Price Change Coverage",
      "How much price change do you want your single-sided position to cover?\n\n" +
        "*10%*: Conservative range, less impermanent loss\n" +
        "*25%*: Moderate range, balanced approach\n" +
        "*50%*: Wide range, more liquidity coverage\n" +
        "*Custom*: Enter your own percentage"
    );

    (ctx.scene.state as WizardState).step = "price_change_selection";

    if (state.enteredCustomAmount) {
      return ctx.reply(message, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("10%", "price_change:10"),
            Markup.button.callback("25%", "price_change:25"),
            Markup.button.callback("50%", "price_change:50"),
          ],
          [Markup.button.callback("✏️ Custom %", "price_change:custom")],
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
          Markup.button.callback("10%", "price_change:10"),
          Markup.button.callback("25%", "price_change:25"),
          Markup.button.callback("50%", "price_change:50"),
        ],
        [Markup.button.callback("✏️ Custom %", "price_change:custom")],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 6: Auto-rebalancing (conditional for SOL auto-convert)
  async (ctx, next) => {
    const state = ctx.scene.state as WizardState;
    const { depositMethod, poolData } = state;

    if (depositMethod !== "sol_auto_convert") {
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

  // Step 7: Summary & Final Confirmation
  async (ctx) => {
    const user = ctx.user;
    const { strategy, amount, percentage, poolData } = ctx.scene
      .state as WizardState;

    try {
      if (!strategy || (!amount && !percentage) || !poolData) {
        await ctx.reply(MessageService.getErrorMessage("Unknown error"));
        return ctx.scene.leave();
      }

      // FIXME handle singled side deposit
      const { tokenAAmount, tokenBAmount } =
        await calculateTokenDistributionForBalancedPosition(
          poolData,
          amount || 0
        );

      const { fromPrice, toPrice } = await meteoraDlmmService.getPriceRange(
        poolData.address,
        user.balancedPositionBinRange
      );

      const summary = generatePositionSummary(ctx.scene.state, {
        rangeMin: fromPrice,
        rangeMax: toPrice,
        tokenAAmount,
        tokenBAmount,
      });

      return ctx.editMessageText(summary, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("Yes, Create Position", "confirm:yes"),
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

  // Step 8: Execution
  async (ctx) => {
    await ctx.editMessageText(
      "⏳ *Creating position...*\n\nThis may take a few moments.",
      { parse_mode: "Markdown" }
    );

    const { strategy, amount, poolData } = ctx.scene.state as WizardState;
    if (!poolData || !strategy || !amount || amount <= 0) {
      await ctx.reply(MessageService.getErrorMessage("Unknown error"));
      return ctx.scene.leave();
    }

    // FIXME handle single sided position
    const result = await positionService.createBalancedPosition(
      ctx.user,
      poolData.address,
      strategy,
      amount
    );

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
  /strategy:(spot|curve|bid-ask)/,
  async (ctx, next) => {
    await ctx.answerCbQuery();
    const state = ctx.scene.state as WizardState;
    state.strategy = ctx.match[1] as MeteoraCreatePositionStrategy;

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

createPositionScene.action(
  /deposit:(sol_auto_convert|single_sided)/,
  async (ctx, next) => {
    await ctx.answerCbQuery();
    const state = ctx.scene.state as WizardState;
    state.depositMethod = ctx.match[1] as "sol_auto_convert" | "single_sided";

    const methodName =
      ctx.match[1] === "sol_auto_convert"
        ? "SOL Auto-convert"
        : "Single-sided Token";
    const message = generateProgressMessage(
      state.poolData!,
      state,
      "Deposit Method Selected",
      `You selected ${methodName}. ${getDepositMethodGuide(ctx.match[1])}`
    );

    await ctx.editMessageText(message, { parse_mode: "Markdown" });

    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      ctx.wizard.step(ctx, next);
    }
  }
);

createPositionScene.action(/token:(.+)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const state = ctx.scene.state as WizardState;
  const selectedTokenMint = ctx.match[1];
  state.selectedToken = selectedTokenMint;

  const tokenName =
    ctx.match[1] === "A"
      ? state.poolData!.tokenA.symbol
      : state.poolData!.tokenB.symbol;
  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Token Selected",
    `You selected ${tokenName}. You'll provide liquidity using only this token.`
  );

  await ctx.editMessageText(message, { parse_mode: "Markdown" });

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action(
  /source:(sol_convert|token_balance)/,
  async (ctx, next) => {
    await ctx.answerCbQuery();
    const state = ctx.scene.state as WizardState;
    state.depositSource = ctx.match[1] as "sol_convert" | "token_balance";

    if (state.depositSource === "sol_convert") {
      const validation = await validateSOLBalance(ctx.user.walletAddress!, 0);
      if (!validation.isValid) {
        return ctx.replyWithMarkdown(
          `❌ Insufficient SOL balance. Current balance: *${formatNumber(validation.currentBalance, { maxDecimals: 6 })} SOL* and required: *${formatNumber(validation.requiredWithBuffer, { maxDecimals: 6 })} SOL*`
        );
      }
    }

    if (state.depositSource === "token_balance") {
      const validation = await validateTokenBalance(
        ctx.user.walletAddress!,
        state.selectedToken!,
        0
      );
      if (!validation.isValid) {
        return ctx.replyWithMarkdown(
          // FIXME
          `❌ Insufficient token balance.`
        );
      }
    }

    const sourceName =
      ctx.match[1] === "sol_convert"
        ? "Convert from SOL"
        : "From Token Balance";

    const message = generateProgressMessage(
      state.poolData!,
      state,
      "Deposit Source Selected",
      `You selected ${sourceName}.`
    );

    await ctx.editMessageText(message, { parse_mode: "Markdown" });

    ctx.wizard.next();
    if (typeof ctx.wizard.step === "function") {
      ctx.wizard.step(ctx, next);
    }
  }
);

createPositionScene.action(/amount:(\d+\.?\d*)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const amount = parseFloat(ctx.match[1]);
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount. Try again.");
  }

  const user = ctx.user;

  const { isValid, currentBalance, requiredWithBuffer } =
    await validateSOLBalance(user.walletAddress!, amount);

  if (!isValid) {
    return ctx.replyWithMarkdown(
      `❌ Insufficient SOL balance to create position.\nCurrent balance: *${formatNumber(currentBalance, { maxDecimals: 6 })} SOL*\nRequired: *${formatNumber(requiredWithBuffer, { maxDecimals: 6 })} SOL*`
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

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action(/percentage:(\d+)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const percentage = parseInt(ctx.match[1]);
  if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
    return ctx.reply("❌ Invalid percentage. Try again.");
  }

  const state = ctx.scene.state as WizardState;
  state.percentage = percentage;

  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Percentage Selected",
    `You selected ${percentage}% of your token balance.`
  );

  await ctx.editMessageText(message, { parse_mode: "Markdown" });

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    ctx.wizard.step(ctx, next);
  }
});

function getStrategyGuide(strategy: string): string {
  switch (strategy) {
    case "spot":
      return "Your funds will be split 50/50 between both tokens at current market price.";
    case "curve":
      return "Your position will be optimized based on the price curve for better capital efficiency.";
    case "bid-ask":
      return "Advanced strategy for market making with custom bid-ask spreads.";
    default:
      return "";
  }
}

function getDepositMethodGuide(method: string): string {
  switch (method) {
    case "sol_auto_convert":
      return "SOL will be automatically converted and split between both pool tokens.";
    case "single_sided":
      return "You can deposit using only one specific token.";
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

  await ctx.replyWithMarkdown(
    "*Enter your custom amount in SOL* (e.g., 2.5):",
    {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
      },
    }
  );

  (ctx.scene.state as WizardState).awaitingCustomAmount = true;
});

createPositionScene.action(/price_change:(\d+)/, async (ctx, next) => {
  await ctx.answerCbQuery();
  const percentage = parseInt(ctx.match[1]);
  if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
    return ctx.reply("❌ Invalid percentage. Try again.");
  }

  const state = ctx.scene.state as WizardState;
  state.priceChangePercentage = percentage;

  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Price Change Coverage Selected",
    `You selected ${percentage}% price change coverage. Your position will be active within this range.`
  );

  await ctx.editMessageText(message, { parse_mode: "Markdown" });

  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    ctx.wizard.step(ctx, next);
  }
});

createPositionScene.action("price_change:custom", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.replyWithMarkdown(
    "*Enter your custom price change percentage* (e.g., 15):",
    {
      parse_mode: "Markdown",
      reply_markup: {
        force_reply: true,
      },
    }
  );

  (ctx.scene.state as WizardState).awaitingCustomPriceChange = true;
});

createPositionScene.action(/rebalance:(yes|no)/, async (ctx, next) => {
  await ctx.answerCbQuery();

  (ctx.scene.state as WizardState).autoRebalancing = ctx.match[1] as
    | "yes"
    | "no";

  const status = ctx.match[1] === "yes" ? "enabled" : "disabled";
  await ctx.editMessageText(
    `${ctx.match[1] === "yes" ? "✅" : "❌"} *Auto-rebalancing ${status}*`,
    {
      parse_mode: "Markdown",
    }
  );

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
  await ctx.deleteMessage();
  return ctx.scene.leave();
});

// Handle text inputs (for custom amount and custom price change)
createPositionScene.on(message("text"), async (ctx, next) => {
  const state = ctx.scene.state as WizardState;

  if (state.awaitingCustomAmount) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply(
        "❌ Invalid amount. Enter a positive number (e.g., 2.5)."
      );
    }

    const user = ctx.user;
    const { isValid, currentBalance, requiredWithBuffer } =
      await validateSOLBalance(user.walletAddress!, amount);

    if (!isValid) {
      return ctx.replyWithMarkdown(
        `❌ Insufficient SOL balance. Current balance - *${formatNumber(currentBalance, { maxDecimals: 6 })} SOL* and required - *${formatNumber(requiredWithBuffer, { maxDecimals: 6 })} SOL*`
      );
    }

    (ctx.scene.state as WizardState).amount = amount;
    (ctx.scene.state as WizardState).awaitingCustomAmount = false;
    (ctx.scene.state as WizardState).enteredCustomAmount = true;

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

  if (state.awaitingCustomPriceChange) {
    const percentage = parseFloat(ctx.message.text);
    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
      return ctx.reply(
        "❌ Invalid percentage. Enter a number between 1 and 100 (e.g., 15)."
      );
    }

    (ctx.scene.state as WizardState).priceChangePercentage = percentage;
    (ctx.scene.state as WizardState).awaitingCustomPriceChange = false;

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

  return await next();
});

createPositionScene.command("back", (ctx: BotContext) => ctx.wizard.back());

createPositionScene.command("cancel", async (ctx) => {
  await ctx.deleteMessage();
  return ctx.scene.leave();
});

// utils
export async function calculateTokenDistributionForBalancedPosition(
  poolInfo: Pool,
  enteredAmount: number
) {
  console.log("token a", poolInfo.tokenA.address);
  console.log("token b", poolInfo.tokenB.address);
  console.log("SOL_MINT", SOL_MINT);
  console.log("enteredAmount", enteredAmount);

  const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
  const amount = enteredAmount - feeAmount;
  console.log("amount", amount);

  // For balanced, split amount 50/50
  const halfAmount = amount / 2;
  const halfAmountLamports = (halfAmount * 1e9).toString();

  const [tokenAAmount, tokenBAmount] = await Promise.all([
    // Calculate token A amount
    (async () => {
      if (poolInfo.tokenA.address === SOL_MINT) {
        return halfAmount;
      } else {
        const orderResponseA = await jupiterService.getOrder({
          inputMint: SOL_MINT,
          outputMint: poolInfo.tokenA.address,
          amount: halfAmountLamports,
        });

        return (
          parseInt(orderResponseA.outAmount) /
          Math.pow(10, poolInfo.tokenA.decimals)
        );
      }
    })(),
    // Calculate token B amount
    (async () => {
      if (poolInfo.tokenB.address === SOL_MINT) {
        return halfAmount;
      } else {
        const orderResponseB = await jupiterService.getOrder({
          inputMint: SOL_MINT,
          outputMint: poolInfo.tokenB.address,
          amount: halfAmountLamports,
        });

        return (
          parseInt(orderResponseB.outAmount) /
          Math.pow(10, poolInfo.tokenB.decimals)
        );
      }
    })(),
  ]);

  console.log("token a amount", tokenAAmount);
  console.log("token b amount", tokenBAmount);

  return {
    tokenAAmount,
    tokenBAmount,
  };
}

// async function calculateBalancedPositionPreview(
//   poolInfo: MeteoraDlmmPoolDetail,
//   enteredAmount: number,
//   binRange: number
// ) {
//   const feeAmount = enteredAmount * (OPEN_POSITION_FEE / 100);
//   const amount = enteredAmount - feeAmount;

//   // For single-sided strategy
//   // if (strategy === "single-sided") {
//   //   if (selectedToken === poolInfo.token_x.address) {
//   //     // Converting SOL to token A
//   //     if (poolInfo.token_x.address === SOL_MINT) {
//   //       return {
//   //         rangeMin: "N/A",
//   //         rangeMax: "N/A",
//   //         tokenAAmount: amount.toString(),
//   //         tokenBAmount: "0",
//   //         autoRebalancing: false,
//   //       };
//   //     } else {
//   //       try {
//   //         const orderResponse = await jupiterService.getOrder({
//   //           inputMint: SOL_MINT,
//   //           outputMint: poolInfo.token_x.address,
//   //           amount: (amount * 1e9).toString(),
//   //         });
//   //         // TODO fix decimals
//   //         const tokenAAmount = (
//   //           parseInt(orderResponse.outAmount) / Math.pow(10, poolInfo.token_x.decimals)
//   //         ).toString();

//   //         return {
//   //           rangeMin: "N/A",
//   //           rangeMax: "N/A",
//   //           tokenAAmount,
//   //           tokenBAmount: "0",
//   //           autoRebalancing: false,
//   //         };
//   //       } catch (error) {
//   //         console.error("Error getting Jupiter quote for token A:", error);
//   //         return {
//   //           rangeMin: "N/A",
//   //           rangeMax: "N/A",
//   //           tokenAAmount: "Error calculating",
//   //           tokenBAmount: "0",
//   //           autoRebalancing: false,
//   //         };
//   //       }
//   //     }
//   //   } else {
//   //     if (poolInfo.token_y.address === SOL_MINT) {
//   //       return {
//   //         rangeMin: "N/A",
//   //         rangeMax: "N/A",
//   //         tokenAAmount: "0",
//   //         tokenBAmount: amount.toString(),
//   //         autoRebalancing: false,
//   //       };
//   //     } else {
//   //       try {
//   //         const orderResponse = await jupiterService.getOrder({
//   //           inputMint: SOL_MINT,
//   //           outputMint: poolInfo.token_y.address,
//   //           amount: (amount * 1e9).toString(), // Convert SOL to lamports
//   //         });

//   //         const tokenBAmount = (
//   //           parseInt(orderResponse.outAmount) / Math.pow(10, 6)
//   //         ).toString();

//   //         return {
//   //           rangeMin: "N/A",
//   //           rangeMax: "N/A",
//   //           tokenAAmount: "0",
//   //           tokenBAmount,
//   //           autoRebalancing: false,
//   //         };
//   //       } catch (error) {
//   //         console.error("Error getting Jupiter quote for token B:", error);
//   //         return {
//   //           rangeMin: "N/A",
//   //           rangeMax: "N/A",
//   //           tokenAAmount: "0",
//   //           tokenBAmount: "Error calculating",
//   //           autoRebalancing: false,
//   //         };
//   //       }
//   //     }
//   //   }
//   // }

//   // For balanced, split amount 50/50
//   const halfAmount = amount / 2;
//   const halfAmountLamports = (halfAmount * 1e9).toString();

//   let tokenAAmount = 0;
//   let tokenBAmount = 0;

//   try {
//     // Calculate token A amount
//     if (poolInfo.token_x.address === SOL_MINT) {
//       tokenAAmount = halfAmount;
//     } else {
//       const orderResponseA = await jupiterService.getOrder({
//         inputMint: SOL_MINT,
//         outputMint: poolInfo.token_x.address,
//         amount: halfAmountLamports,
//       });
//       tokenAAmount =
//         parseInt(orderResponseA.outAmount) /
//         Math.pow(10, poolInfo.token_x.decimals);
//     }

//     // Calculate token B amount
//     if (poolInfo.token_y.address === SOL_MINT) {
//       tokenBAmount = halfAmount;
//     } else {
//       const orderResponseB = await jupiterService.getOrder({
//         inputMint: SOL_MINT,
//         outputMint: poolInfo.token_y.address,
//         amount: halfAmountLamports,
//       });
//       tokenBAmount =
//         parseInt(orderResponseB.outAmount) /
//         Math.pow(10, poolInfo.token_y.decimals);
//     }
//   } catch (error) {
//     console.error("Error getting Jupiter quotes:", error);
//     tokenAAmount = 0;
//     tokenBAmount = 0;
//   }

//   const { fromPrice, toPrice } = await meteoraDlmmService.getPriceRange(
//     poolInfo.address,
//     binRange
//   );

//   return {
//     rangeMin: fromPrice,
//     rangeMax: toPrice,
//     tokenAAmount,
//     tokenBAmount,
//   };
// }

async function validateSOLBalance(
  walletAddress: string,
  requiredAmount: number
): Promise<{
  isValid: boolean;
  currentBalance: number;
  requiredWithBuffer: number;
}> {
  const currentBalance = await solanaService.getBalance(walletAddress);
  const requiredWithBuffer = requiredAmount + BUFFER_AMOUNT;

  const isValid = currentBalance >= requiredWithBuffer;

  return {
    isValid,
    currentBalance,
    requiredWithBuffer,
  };
}

export async function validateTokenBalance(
  walletAddress: string,
  tokenMint: string,
  requiredAmount: number
): Promise<{
  isValid: boolean;
  currentBalance: number;
  requiredAmount: number;
}> {
  let currentBalance = 0;

  if (tokenMint === SOL_MINT) {
    currentBalance = await solanaService.getBalance(walletAddress);
  } else {
    const result = await solanaService.getTokenBalance(
      walletAddress,
      tokenMint
    );
    currentBalance = result.balance;
  }

  const isValid = currentBalance >= requiredAmount && requiredAmount > 0;

  return {
    isValid,
    currentBalance,
    requiredAmount,
  };
}
