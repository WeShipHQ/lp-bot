import { Scenes, Markup } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { SCENE_IDS } from "../config/scenes";
import { MeteoraCreatePositionStrategy } from "@/types/meteora.types";
import { message } from "telegraf/filters";
import { Token } from "@/types/token.types";
import { getSolscanLink } from "@/utils/link";
import { CreatePositionUseCase } from "@/application/position/create-position.use-case";
import { container } from "@/infrastructure/di/container";
import { GetPoolDetailsUseCase } from "@/application/trending/get-pool-details.use-case";
import { GetBalanceUseCase } from "@/application/wallet/get-balance.use-case";
import { GetTokenBalanceUseCase } from "@/application/wallet/get-token-balance.use-case";
import { CalculateBalancedDistributionUseCase } from "@/application/position/calculate-balanced-distribution.use-case";
import { GetPriceRangeUseCase } from "@/application/position/get-price-range.use-case";
import { DexType, UnifiedPool } from "@/types/core.types";
import {
  generateProgressMessage,
  generatePositionSummary,
} from "../formatters/position.formatter";
import { GetPoolTokenBalancesUseCase } from "@/application/wallet/get-pool-token-balances.use-case";
import { BUFFER_AMOUNT, SLIPPAGE_SMALL } from "@/config/constants";
import { formatNumber } from "../formatters/base.formatter";
import { link } from "@/utils/misc";
import { DISABLE_LINK_PREVIEW } from "../constants/base.constants";
import { getTokenPriceService } from "@/services/token-price.service";
import { logger } from "@/utils/logger";

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
  dex?: DexType;
  poolData?: UnifiedPool;
  strategy?: MeteoraCreatePositionStrategy;
  depositMethod?: "sol_auto_convert" | "single_sided";
  selectedToken?: Token;
  depositSource?: "sol_convert" | "token_balance";
  amount?: number;
  percentage?: number;
  priceChangePercentage?: number;
  autoRebalancing?: "yes" | "no";
  awaitingCustomAmount?: boolean;
  awaitingCustomPriceChange?: boolean;
  enteredCustomAmount?: boolean;
  messageId?: number;
  tokenAAmountCalculated?: number;
  tokenBAmountCalculated?: number;
  priceRange?: {
    min: number | string;
    max: number | string;
    rangeInterval: number;
  };
};

const SKIP_VALIDATE = false;

export const createPositionScene = new Scenes.WizardScene<BotContext>(
  SCENE_IDS.CREATE_POSITION_SCENE,

  // Step 0: Entry/Welcome & Strategy Selection
  async (ctx) => {
    try {
      const { poolAddress, dex } = ctx.wizard.state as WizardState;

      if (!poolAddress || !dex) {
        await ctx.reply("Pool address not found");
        return ctx.scene.leave();
      }

      const poolUseCase = container.get(GetPoolDetailsUseCase);
      const poolData = await poolUseCase.execute({
        poolAddress,
        dex: dex as DexType,
      });
      console.log("poolData", poolData);
      if (!poolData) {
        await ctx.reply("Pool not found");
        return ctx.scene.leave();
      }

      // Store pool data in wizard state
      (ctx.scene.state as WizardState).poolData = poolData;
      (ctx.scene.state as WizardState).step = "strategy_selection";

      const message = generateProgressMessage(
        poolData,
        ctx.scene.state as WizardState,
        "Choose Your Liquidity Strategy (1/8)",
        `📊 *Spot*: Evenly spreads liquidity across the range. Beginner-friendly, flexible for any market, minimal rebalancing. Ideal for volatile pairs.\n\n` +
          `📈 *Curve*: Concentrates liquidity in the middle. Efficient for stable pairs (e.g., USDC/USDT) with low price swings, maximizes fees with less capital.\n\n` +
          `⚖️ *Bid-Ask*: Places liquidity at range edges. Advanced for high-volatility markets, high fee potential but higher impermanent loss risk. Great for single-sided DCA strategies.\n\n` +
          `⚠️ Note: All strategies involve impermanent loss risk. Learn more: ${link("Meteora Strategies", "https://docs.meteora.ag/overview/products/dlmm/strategies-and-use-cases")}.`
      );

      const msg = await ctx.replyWithMarkdown(message, {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("Spot", "strategy:spot"),
            Markup.button.callback("Curve", "strategy:curve"),
          ],
          [Markup.button.callback("Bid-ask", "strategy:bid-ask")],
          [Markup.button.callback("❌ Cancel", "cancel")],
        ]),
        ...DISABLE_LINK_PREVIEW,
      });
      (ctx.scene.state as WizardState).messageId = msg.message_id;
    } catch (error) {
      console.error("Error in create position scene:", error);
      await ctx.reply("Failed to load strategy options");
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
      "How to Add Liquidity? (2/8)",
      `⚖️ *Balanced*: Deposit SOL only—auto-swapped and split 50/50 between tokens for even liquidity. Simple and hands-off.\n\n` +
        "🔸 *Single-Sided*: Deposit just one token. More control but may require price range setup to avoid imbalances.\n\n"
    );

    (ctx.scene.state as WizardState).step = "deposit_method";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("Balanced", "deposit:sol_auto_convert"),
          Markup.button.callback("Single-Sided", "deposit:single_sided"),
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
      await ctx.reply("Unknown error");
      return ctx.scene.leave();
    }
    if (depositMethod !== "single_sided") {
      ctx.wizard.next(); // Skip to amount if SOL auto-convert
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    const poolBalancesUc = container.get(GetPoolTokenBalancesUseCase);
    const { tokenABalance, tokenBBalance } = await poolBalancesUc.execute({
      walletAddress: ctx.user.walletAddress!,
      pool: poolData,
    });

    const message = generateProgressMessage(
      poolData!,
      state,
      "Select Token to Deposit",
      "Choose the token for your single-sided deposit. We'll add liquidity to that side of the pool.\n\n" +
        "Current balances:\t" +
        `*${formatNumber(tokenABalance, { maxDecimals: 6 })} ${poolData.tokenA.symbol}*\t|\t` +
        `*${formatNumber(tokenBBalance, { maxDecimals: 6 })} ${poolData.tokenB.symbol}*`
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
    const { depositMethod, selectedToken, poolData } = state;

    if (!poolData) {
      await ctx.reply("Unknown error");
      return ctx.scene.leave();
    }

    if (depositMethod !== "single_sided") {
      ctx.wizard.next(); // Skip if not single-sided
      if (typeof ctx.wizard.step === "function") {
        return ctx.wizard.step(ctx, next);
      }
    }

    // FIXME chekc selected token

    // const { tokenABalance, tokenBBalance } = await getPoolTokenBalances(
    //   ctx.user.walletAddress!,
    //   poolData
    // );

    const message = generateProgressMessage(
      poolData!,
      state,
      "Deposit Source (4/8)",
      "💱 *Convert from SOL*: Swap *SOL* to your selected token and deposit.\n\n" +
        `💰 *From Balance*: Use your existing *${selectedToken}* balance (select % below).\n\n` +
        `Balances: {sol_balance} | {selected_token_symbol}: {token_balance}\n\n` +
        `⚠️ Slippage Warning: Swaps may slip by up to *${SLIPPAGE_SMALL}%* in volatile markets.`
      // "Current token balances:\t" +
      // `*${formatNumber(tokenABalance, { maxDecimals: 6 })} ${poolData.tokenA.symbol}*\t|\t` +
      // `*${formatNumber(tokenBBalance, { maxDecimals: 6 })} ${poolData.tokenB.symbol}*`
    );

    (ctx.scene.state as WizardState).step = "deposit_source";

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("Convert from SOL", "source:sol_convert")],
        [Markup.button.callback("From Balance", "source:token_balance")],
        [
          Markup.button.callback("🔙 Back", "back"),
          Markup.button.callback("❌ Cancel", "cancel"),
        ],
      ]),
    });
  },

  // Step 4: Amount/Percentage Selection
  async (ctx, next) => {
    try {
      const user = ctx.user;
      const state = ctx.scene.state as WizardState;
      const { depositMethod, depositSource, selectedToken, poolData } = state;

      if (!poolData) {
        await ctx.reply("Unknown error");
        return ctx.scene.leave();
      }

      (ctx.scene.state as WizardState).step = "amount";

      if (
        depositMethod === "single_sided" &&
        depositSource === "token_balance"
      ) {
        if (!selectedToken) {
          await ctx.reply("Unknown error");
          return ctx.scene.leave();
        }

        const tbUc = container.get(GetTokenBalanceUseCase);
        const tokenBalance = await tbUc.execute({
          walletAddress: ctx.user.walletAddress!,
          tokenMint: selectedToken.address,
        });

        const tokenSymbol =
          selectedToken.address === poolData.tokenA.address
            ? poolData.tokenA.symbol
            : poolData.tokenB.symbol;

        const message = generateProgressMessage(
          poolData!,
          state,
          "Choose Percentage",
          `Select what percentage of your ${tokenSymbol} balance to deposit.\n` +
            `Current ${tokenSymbol} balance: *${formatNumber(tokenBalance.balance, { maxDecimals: 6 })} ${tokenSymbol}*`
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
        const balanceUc = container.get(GetBalanceUseCase);
        const { sol: balance } = await balanceUc.execute(user.walletAddress!);
        const guide =
          depositMethod === "sol_auto_convert"
            ? "We'll auto-split this SOL evenly between tokens."
            : `We'll convert this SOL to ${selectedToken?.symbol}.`;

        const message = generateProgressMessage(
          poolData!,
          state,
          "Enter SOL Amount (3/8)",
          `${guide}\n\n` +
            // Min amount: {min_sol} SOL | Current balance: {sol_balance} SOL
            `Current balance: *${formatNumber(balance, { maxDecimals: 6 })} SOL*`
        );

        return ctx.editMessageText(message, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback("0.1 SOL", "amount:0.1"),
              Markup.button.callback("1 SOL", "amount:1"),
              Markup.button.callback("5 SOL", "amount:5"),
              // Max SOL
            ],
            [Markup.button.callback("✏️ Custom", "amount:custom")],
            [
              Markup.button.callback("🔙 Back", "back"),
              Markup.button.callback("❌ Cancel", "cancel"),
            ],
          ]),
        });
      }
    } catch (error) {
      console.error(error);
      next();
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
      "Customize Settings (7/8)",
      "✅ Auto-Rebalance: Monitor and adjust every 1hr if out of range (fees apply)."
    );

    return ctx.editMessageText(message, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("✅ Enable Rebalance", "rebalance:yes"),
          Markup.button.callback("❌ No Rebalance", "rebalance:no"),
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
    const { strategy, amount, percentage, poolData, dex } = ctx.scene
      .state as WizardState;

    try {
      if (!strategy || (!amount && !percentage) || !poolData || !dex) {
        await ctx.reply("❌ Please complete all steps before confirming.");
        return ctx.scene.leave();
      }

      // FIXME handle single-sided deposit in future
      const distUc = container.get(CalculateBalancedDistributionUseCase);
      const { tokenAAmount, tokenBAmount } = await distUc.execute({
        pool: poolData,
        solAmount: amount || 0,
      });

      const priceRangeUc = container.get(GetPriceRangeUseCase);
      const prices = await priceRangeUc.execute({
        poolAddress: poolData.address,
        dex: dex as DexType,
        rangeInterval: user.balancedPositionBinRange,
      });

      (ctx.scene.state as WizardState).tokenAAmountCalculated = tokenAAmount;
      (ctx.scene.state as WizardState).tokenBAmountCalculated = tokenBAmount;
      (ctx.scene.state as WizardState).priceRange = {
        min: prices.fromPrice,
        max: prices.toPrice,
        rangeInterval: user.balancedPositionBinRange,
      };

      const summary = generatePositionSummary(
        poolData,
        ctx.scene.state as WizardState,
        {
          rangeMin: prices.fromPrice,
          rangeMax: prices.toPrice,
          tokenAAmount,
          tokenBAmount,
        }
      );

      return ctx.editMessageText(summary, {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Create Position", "confirm:yes"),
            Markup.button.callback("🔙 Back", "back"),
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
      "⏳ Building transaction... (Est. time: 10-30s)",
      { parse_mode: "Markdown" }
    );

    const state = ctx.scene.state as WizardState;
    // console.log({ state });
    const { strategy, amount, poolData, autoRebalancing, dex, depositMethod } =
      state;

    if (!poolData || !strategy || !amount || amount <= 0) {
      await ctx.reply("❌ Missing required data. Please try again.");
      return ctx.scene.leave();
    }

    try {
      // const distUc = container.get(CalculateBalancedDistributionUseCase);
      // const tokenAAmount = state.tokenAAmountCalculated ?? (
      //   await distUc.execute({ pool: poolData, solAmount: amount || 0 })
      // ).tokenAAmount;
      // const tokenBAmount = state.tokenBAmountCalculated ?? (
      //   await distUc.execute({ pool: poolData, solAmount: amount || 0 })
      // ).tokenBAmount;
      // const { tokenAAmount, tokenBAmount } = await distUc.execute({
      //   pool: poolData,
      //   solAmount: amount,
      // });

      // const priceService = getTokenPriceService();
      // const solMint = "So11111111111111111111111111111111111111112";
      // const mints = [poolData.tokenA.address, poolData.tokenB.address, solMint];
      // const priceData = await priceService.getPrices(mints);

      // const priceRange = state.priceRange ?? {
      //   min: 0,
      //   max: 0,
      //   rangeInterval: ctx.user.balancedPositionBinRange,
      // };

      // const rebalanceThreshold = ctx.user.rebalanceThreshold
      //   ? Number(ctx.user.rebalanceThreshold)
      //   : 20;

      // const positionContext: PositionCreationContext = {
      //   userId: ctx.user.id,
      //   walletAddress: ctx.user.walletAddress!,
      //   // walletId: ctx.user.walletId,
      //   dex: (dex as DexType) || "meteora",
      //   poolAddress: poolData.address,
      //   strategy,
      //   depositMethod: depositMethod || "sol_auto_convert",
      //   depositSource: state.depositSource,
      //   solAmount: amount,
      //   tokenAAmount: String(tokenAAmount),
      //   tokenBAmount: String(tokenBAmount),
      //   tokenAMint: poolData.tokenA.address,
      //   tokenBMint: poolData.tokenB.address,
      //   tokenASymbol: poolData.tokenA.symbol,
      //   tokenBSymbol: poolData.tokenB.symbol,
      //   tokenADecimals: poolData.tokenA.decimals,
      //   tokenBDecimals: poolData.tokenB.decimals,
      //   priceRange,
      //   autoRebalance: autoRebalancing === "yes",
      //   rebalanceThreshold,
      //   quotes: {
      //     solUsd: priceData[solMint]?.price ?? 0,
      //     tokenAUsd: priceData[poolData.tokenA.address]?.price ?? 0,
      //     tokenBUsd: priceData[poolData.tokenB.address]?.price ?? 0,
      //   },
      //   slippage: SLIPPAGE_SMALL,
      // };

      logger.info("Creating position with context", {
        userId: ctx.user.id,
        poolAddress: poolData.address,
        strategy,
        tokenAAmount: state.tokenAAmountCalculated,
        tokenBAmount: state.tokenBAmountCalculated,
      });

      const createUC = container.get(CreatePositionUseCase);
      const result = await createUC.execute({
        userId: ctx.user.id,
        walletId: ctx.user.walletId!,
        walletAddress: ctx.user.walletAddress!,
        dex: (dex as DexType) || "meteora",

        poolAddress: poolData.address,
        tokenA: poolData.tokenA,
        tokenB: poolData.tokenB,

        tokenAAmount: String(state.tokenAAmountCalculated || 0),
        tokenBAmount: String(state.tokenBAmountCalculated || 0),
        strategy,
        slippage: SLIPPAGE_SMALL,
        autoRebalance: autoRebalancing === "yes",
        depositMethod: depositMethod,
        depositSource: state.depositSource,
        solAmount: amount,

        priceRange: state.priceRange
          ? {
              min: Number(state.priceRange.min),
              max: Number(state.priceRange.max),
              rangeInterval: state.priceRange.rangeInterval,
            }
          : undefined,
      });

      if (!result.success || !result.signature) {
        logger.error("Position creation failed", {
          error: result.error,
          userId: ctx.user.id,
        });

        await ctx.editMessageText(
          `❌ *Failed to create position*\n\n${result.error || "Unknown error"}\n\nPlease try again.`,
          { parse_mode: "Markdown" }
        );
        return ctx.scene.leave();
      }

      logger.info("Position transaction submitted", {
        signature: result.signature,
        positionAddress: result.positionAddress,
        userId: ctx.user.id,
      });

      const solScanLink = link(
        "View Transaction",
        getSolscanLink("tx", result.signature)
      );

      await ctx.editMessageText(
        `✅ *Position Transaction Submitted!*\n\n` +
          `${solScanLink}\n\n` +
          `⏳ Your position is being confirmed on-chain. You'll receive a notification when it's ready.\n\n` +
          `📊 Check your portfolio in a few moments to see your new position.`,
        { parse_mode: "Markdown", ...DISABLE_LINK_PREVIEW }
      );

      // await ctx.editMessageText(
      //   `✅ *Position Transaction Submitted!*\n\n` +
      //     `${"solScanLink"}\n\n` +
      //     `⏳ Your position is being confirmed on-chain. You'll receive a notification when it's ready.\n\n` +
      //     `📊 Check your portfolio in a few moments to see your new position.`,
      //   { parse_mode: "Markdown", ...DISABLE_LINK_PREVIEW }
      // );
    } catch (error) {
      logger.error("Error creating position via use case", {
        error,
        userId: ctx.user.id,
        poolAddress: poolData?.address,
      });

      await ctx.editMessageText(
        "❌ *Failed to create position*\n\nAn unexpected error occurred. Please try again.",
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
  state.selectedToken =
    state.poolData?.tokenA.address === selectedTokenMint
      ? state.poolData!.tokenA
      : state.poolData!.tokenB;

  if (!state.selectedToken) {
    return ctx.reply("Unknown error");
  }

  const message = generateProgressMessage(
    state.poolData!,
    state,
    "Token Selected",
    `You selected ${state.selectedToken.symbol}. You'll provide liquidity using only this token.`
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
        state.selectedToken!.address,
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

  if (!isValid && !SKIP_VALIDATE) {
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

// Handle confirmation action
createPositionScene.action(/confirm:yes/, async (ctx) => {
  await ctx.answerCbQuery();
  
  // This is handled by the wizard step function
  // The actual confirmation logic is in Step 8 (Execution step)
  ctx.wizard.next();
  if (typeof ctx.wizard.step === "function") {
    ctx.wizard.step(ctx, () => {});
  }
});

// utils
// Balanced distribution logic moved to CalculateBalancedDistributionUseCase

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
  const balanceUc = container.get(GetBalanceUseCase);
  const { sol: currentBalance } = await balanceUc.execute(walletAddress);
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
  const tokenBalanceUc = container.get(GetTokenBalanceUseCase);
  const { balance: currentBalance } = await tokenBalanceUc.execute({
    walletAddress,
    tokenMint,
  });

  const isValid = currentBalance >= requiredAmount && requiredAmount > 0;

  return {
    isValid,
    currentBalance,
    requiredAmount,
  };
}
