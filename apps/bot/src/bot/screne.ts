// import { Scenes, Markup } from "telegraf";
// import { BotContext } from "@/types/bot.types";
// import { FastifyInstance } from "fastify";

// // Scene IDs
// const SCENE_IDS = {
//   TOKEN_INPUT: "TOKEN_INPUT_SCENE",
//   POOL_SELECTION: "POOL_SELECTION_SCENE",
//   STRATEGY_SELECTION: "STRATEGY_SELECTION_SCENE",
//   AMOUNT_INPUT: "AMOUNT_INPUT_SCENE",
//   CUSTOM_AMOUNT: "CUSTOM_AMOUNT_SCENE",
//   SIDE_SELECTION: "SIDE_SELECTION_SCENE",
//   CONFIRMATION: "CONFIRMATION_SCENE",
// };

// // Mock functions for external API calls
// const mockJupiterTokenInfo = async (tokenAddress: string) => {
//   console.log(`Fetching token info from Jupiter for: ${tokenAddress}`);
//   return {
//     address: tokenAddress,
//     name: "Mock Token",
//     symbol: "MOCK",
//     decimals: 9,
//     logoURI: "https://example.com/logo.png",
//     price: 0.5,
//     marketCap: 1000000,
//   };
// };

// const mockMeteoraPoolInfo = async (tokenAddress: string) => {
//   console.log(`Finding best liquidity pool on Meteora for: ${tokenAddress}`);
//   return {
//     poolAddress: "MockPoolAddress123",
//     tokenA: {
//       symbol: "SOL",
//       address: "So11111111111111111111111111111111111111112",
//     },
//     tokenB: { symbol: "MOCK", address: tokenAddress },
//     tvl: 500000,
//     apr: 15.5,
//     poolType: "dlmm",
//   };
// };

// const mockMeteoraPoolDetails = async (
//   poolAddress: string,
//   poolType: string
// ) => {
//   console.log(
//     `Fetching pool details from Meteora: ${poolAddress} (${poolType})`
//   );
//   return {
//     poolAddress,
//     tokenA: {
//       symbol: "SOL",
//       address: "So11111111111111111111111111111111111111112",
//     },
//     tokenB: {
//       symbol: "USDC",
//       address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//     },
//     tvl: 750000,
//     apr: 12.3,
//     poolType,
//   };
// };

// const mockExecuteTransaction = async (
//   strategy: string,
//   amount: number,
//   tokenA: string,
//   tokenB: string
// ) => {
//   console.log(
//     `Executing ${strategy} transaction: ${amount} SOL, tokens: ${tokenA} <-> ${tokenB}`
//   );
//   return {
//     signature: "MockTransactionSignature123",
//     success: true,
//   };
// };

// // Utility functions
// const isValidTokenAddress = (input: string): boolean => {
//   return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input);
// };

// const parseMeteoraUrl = (
//   input: string
// ): { poolType: string; poolAddress: string } | null => {
//   const patterns = [
//     /\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
//     /\/damm1\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
//     /\/damm2\/([1-9A-HJ-NP-Za-km-z]{32,44})/,
//   ];

//   for (const pattern of patterns) {
//     const match = input.match(pattern);
//     if (match) {
//       const poolType = input.includes("/dlmm/")
//         ? "dlmm"
//         : input.includes("/damm1/")
//           ? "damm_v1"
//           : "damm_v2";
//       return { poolType, poolAddress: match[1] };
//     }
//   }
//   return null;
// };

// // Scene: Token Input Handler
// const tokenInputScene = new Scenes.BaseScene<BotContext>(SCENE_IDS.TOKEN_INPUT);

// tokenInputScene.enter(async (ctx) => {
//   const input = (ctx.scene.state as any).userInput;
//   console.log("tokenInputScene scene: ", ctx.scene.state, input);

//   if (isValidTokenAddress(input)) {
//     try {
//       const tokenInfo = await mockJupiterTokenInfo(input);
//       // ctx.scene.state.tokenInfo = tokenInfo;
//       ctx.scene.session.tokenInfo = tokenInfo;

//       await ctx.reply(
//         `🪙 **${tokenInfo.name} (${tokenInfo.symbol})**\n\n` +
//           `📍 Address: \`${tokenInfo.address}\`\n` +
//           `💰 Price: $${tokenInfo.price}\n` +
//           `📊 Market Cap: $${tokenInfo.marketCap.toLocaleString()}`,
//         {
//           parse_mode: "Markdown",
//           ...Markup.inlineKeyboard([
//             Markup.button.callback(
//               "🚀 Open Position",
//               `open_position_${tokenInfo.address}`
//             ),
//           ]),
//         }
//       );
//     } catch (error) {
//       await ctx.reply(
//         "❌ Failed to fetch token information. Please try again."
//       );
//       return ctx.scene.leave();
//     }
//   } else {
//     const poolData = parseMeteoraUrl(input);
//     if (poolData) {
//       // Handle Meteora pool URL
//       try {
//         const poolInfo = await mockMeteoraPoolDetails(
//           poolData.poolAddress,
//           poolData.poolType
//         );
//         ctx.scene.session.poolInfo = poolInfo;

//         await ctx.reply(
//           `🏊 **Pool Information**\n\n` +
//             `🔗 Pool: ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}\n` +
//             `📍 Address: \`${poolInfo.poolAddress}\`\n` +
//             `💧 TVL: $${poolInfo.tvl.toLocaleString()}\n` +
//             `📈 APR: ${poolInfo.apr}%\n` +
//             `🔧 Type: ${poolInfo.poolType}`,
//           {
//             parse_mode: "Markdown",
//             ...Markup.inlineKeyboard([
//               Markup.button.callback(
//                 "🚀 Open Position",
//                 `open_position_pool_${poolInfo.poolAddress}`
//               ),
//             ]),
//           }
//         );
//       } catch (error) {
//         await ctx.reply(
//           "❌ Failed to fetch pool information. Please try again."
//         );
//         return ctx.scene.leave();
//       }
//     } else {
//       await ctx.reply(
//         "❌ Invalid input. Please provide a valid token address or Meteora pool URL."
//       );
//       return ctx.scene.leave();
//     }
//   }
// });

// // Handle Open Position button clicks
// tokenInputScene.action(/^open_position_(.+)$/, async (ctx) => {
//   const tokenAddress = ctx.match[1];

//   if (ctx.scene.session.tokenInfo) {
//     // Find best pool for token
//     try {
//       const poolInfo = await mockMeteoraPoolInfo(tokenAddress);
//       ctx.scene.session.poolInfo = poolInfo;

//       await ctx.editMessageText(
//         `🏊 **Best Pool Found**\n\n` +
//           `🔗 Pool: ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}\n` +
//           `📍 Address: \`${poolInfo.poolAddress}\`\n` +
//           `💧 TVL: $${poolInfo.tvl.toLocaleString()}\n` +
//           `📈 APR: ${poolInfo.apr}%`,
//         {
//           parse_mode: "Markdown",
//           ...Markup.inlineKeyboard([
//             Markup.button.callback(
//               "🚀 Continue to Strategies",
//               "continue_to_strategies"
//             ),
//           ]),
//         }
//       );
//     } catch (error) {
//       await ctx.answerCbQuery("❌ Failed to find liquidity pool");
//       return ctx.scene.leave();
//     }
//   } else {
//     // Direct pool access
//     await ctx.editMessageText(ctx.callbackQuery.message.text, {
//       parse_mode: "Markdown",
//       ...Markup.inlineKeyboard([
//         Markup.button.callback(
//           "🚀 Continue to Strategies",
//           "continue_to_strategies"
//         ),
//       ]),
//     });
//   }
// });

// tokenInputScene.action("continue_to_strategies", async (ctx) => {
//   await ctx.answerCbQuery();
//   return ctx.scene.enter(SCENE_IDS.STRATEGY_SELECTION, ctx.scene.state);
// });

// // Scene: Strategy Selection
// const strategySelectionScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.STRATEGY_SELECTION
// );

// strategySelectionScene.enter(async (ctx) => {
//   const poolInfo = ctx.scene.session.poolInfo;

//   await ctx.reply(
//     `🎯 **Choose Your Strategy**\n\n` +
//       `Pool: ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}\n\n` +
//       `📊 **Spot**: Equal distribution across price range\n` +
//       `📈 **Curve**: Concentrated around current price\n` +
//       `🎯 **Single-Sided**: Provide liquidity in one token only`,
//     {
//       parse_mode: "Markdown",
//       ...Markup.inlineKeyboard([
//         [Markup.button.callback("📊 Spot", "strategy_spot")],
//         [Markup.button.callback("📈 Curve", "strategy_curve")],
//         [Markup.button.callback("🎯 Single-Sided", "strategy_single")],
//       ]),
//     }
//   );
// });

// strategySelectionScene.action(/^strategy_(spot|curve|single)$/, async (ctx) => {
//   const strategy = ctx.match[1];
//   ctx.scene.session.strategy = strategy;
//   await ctx.answerCbQuery();

//   if (strategy === "single") {
//     return ctx.scene.enter(SCENE_IDS.SIDE_SELECTION, ctx.scene.state);
//   } else {
//     return ctx.scene.enter(SCENE_IDS.AMOUNT_INPUT, ctx.scene.state);
//   }
// });

// // Scene: Side Selection (for Single-Sided strategy)
// const sideSelectionScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.SIDE_SELECTION
// );

// sideSelectionScene.enter(async (ctx) => {
//   const poolInfo = ctx.scene.session.poolInfo;

//   await ctx.reply(
//     `🎯 **Choose a side to supply liquidity**\n\n` +
//       `Select which token you want to provide:`,
//     {
//       parse_mode: "Markdown",
//       ...Markup.inlineKeyboard([
//         [
//           Markup.button.callback(
//             `💰 ${poolInfo.tokenA.symbol}`,
//             `side_${poolInfo.tokenA.symbol}`
//           ),
//         ],
//         [
//           Markup.button.callback(
//             `🪙 ${poolInfo.tokenB.symbol}`,
//             `side_${poolInfo.tokenB.symbol}`
//           ),
//         ],
//       ]),
//     }
//   );
// });

// sideSelectionScene.action(/^side_(.+)$/, async (ctx) => {
//   const selectedSide = ctx.match[1];
//   ctx.scene.session.selectedSide = selectedSide;
//   await ctx.answerCbQuery();
//   return ctx.scene.enter(SCENE_IDS.AMOUNT_INPUT, ctx.scene.state);
// });

// // Scene: Amount Input
// const amountInputScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.AMOUNT_INPUT
// );

// amountInputScene.enter(async (ctx) => {
//   const strategy = ctx.scene.session.strategy;
//   const selectedSide = ctx.scene.session.selectedSide;

//   let message = `💰 **How much do you want to add?**\n\n`;

//   if (strategy === "single" && selectedSide) {
//     message += `Strategy: Single-Sided (${selectedSide})\n`;
//   } else {
//     message += `Strategy: ${strategy.charAt(0).toUpperCase() + strategy.slice(1)}\n`;
//   }

//   await ctx.reply(message, {
//     parse_mode: "Markdown",
//     ...Markup.inlineKeyboard([
//       [Markup.button.callback("1 SOL", "amount_1")],
//       [Markup.button.callback("5 SOL", "amount_5")],
//       [Markup.button.callback("10 SOL", "amount_10")],
//       [Markup.button.callback("💭 Custom", "amount_custom")],
//     ]),
//   });
// });

// amountInputScene.action(/^amount_(\d+)$/, async (ctx) => {
//   const amount = parseInt(ctx.match[1]);
//   ctx.scene.session.amount = amount;
//   await ctx.answerCbQuery();
//   return ctx.scene.enter(SCENE_IDS.CONFIRMATION, ctx.scene.state);
// });

// amountInputScene.action("amount_custom", async (ctx) => {
//   await ctx.answerCbQuery();
//   return ctx.scene.enter(SCENE_IDS.CUSTOM_AMOUNT, ctx.scene.state);
// });

// // Scene: Custom Amount Input
// const customAmountScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.CUSTOM_AMOUNT
// );

// customAmountScene.enter(async (ctx) => {
//   await ctx.reply(
//     `💭 **Enter custom amount**\n\n` +
//       `Please enter the amount of SOL you want to add:`,
//     { parse_mode: "Markdown" }
//   );
// });

// customAmountScene.on("text", async (ctx) => {
//   const input = ctx.message.text;
//   const amount = parseFloat(input);

//   if (isNaN(amount) || amount <= 0) {
//     await ctx.reply("❌ Please enter a valid positive number.");
//     return;
//   }

//   ctx.scene.session.amount = amount;
//   return ctx.scene.enter(SCENE_IDS.CONFIRMATION, ctx.scene.state);
// });

// // Scene: Confirmation
// const confirmationScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.CONFIRMATION
// );

// confirmationScene.enter(async (ctx) => {
//   const { strategy, amount, poolInfo, selectedSide } = ctx.scene.session;

//   let message = `🤖 **Confirmation**\n\n`;

//   if (strategy === "single") {
//     message += `Agent will create a single-sided position by adding ${amount} SOL worth of ${selectedSide} to the ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol} pool.`;
//   } else {
//     message += `Agent will create a concentrated ${strategy} position in this pool by equally dividing your ${amount} SOL into ${poolInfo.tokenA.symbol} and ${poolInfo.tokenB.symbol}.`;
//   }

//   await ctx.reply(message, {
//     parse_mode: "Markdown",
//     ...Markup.inlineKeyboard([
//       [Markup.button.callback("✅ Yes", "confirm_yes")],
//       [Markup.button.callback("❌ No", "confirm_no")],
//     ]),
//   });
// });

// confirmationScene.action("confirm_no", async (ctx) => {
//   await ctx.answerCbQuery();
//   await ctx.editMessageText(
//     "❌ **Cancelled initialization of the position.**",
//     { parse_mode: "Markdown" }
//   );
//   return ctx.scene.leave();
// });

// confirmationScene.action("confirm_yes", async (ctx) => {
//   await ctx.answerCbQuery();

//   const { strategy, amount, poolInfo, selectedSide } = ctx.scene.session;

//   try {
//     await ctx.editMessageText("⏳ **Processing transaction...**", {
//       parse_mode: "Markdown",
//     });

//     const result = await mockExecuteTransaction(
//       strategy,
//       amount,
//       poolInfo.tokenA.symbol,
//       poolInfo.tokenB.symbol
//     );

//     if (result.success) {
//       await ctx.editMessageText(
//         `✅ **Transaction Successful!**\n\n` +
//           `🎉 Your ${strategy} position has been created successfully.\n` +
//           `📝 Transaction: \`${result.signature}\`\n\n` +
//           `💰 Amount: ${amount} SOL\n` +
//           `🏊 Pool: ${poolInfo.tokenA.symbol}/${poolInfo.tokenB.symbol}`,
//         { parse_mode: "Markdown" }
//       );
//     } else {
//       throw new Error("Transaction failed");
//     }
//   } catch (error) {
//     await ctx.editMessageText(
//       "❌ **Transaction Failed**\n\n" +
//         "Something went wrong while creating your position. Please try again later.",
//       { parse_mode: "Markdown" }
//     );
//   }

//   return ctx.scene.leave();
// });

// // Create and export the stage
// export const createTradingStage = () => {
//   return new Scenes.Stage<BotContext>([
//     tokenInputScene,
//     strategySelectionScene,
//     sideSelectionScene,
//     amountInputScene,
//     customAmountScene,
//     confirmationScene,
//   ]);
// };

// // Message handler for direct user input
// export const handleDirectMessage = async (
//   ctx: BotContext,
//   server: FastifyInstance
// ) => {
//   // const input = ctx.message.text;
//   const input = ctx.message && "text" in ctx.message ? ctx.message.text : "";

//   if (!input) {
//     return;
//   }

//   if (isValidTokenAddress(input) || parseMeteoraUrl(input)) {
//     return ctx.scene.enter(SCENE_IDS.TOKEN_INPUT, { userInput: input });
//   }

//   // If not a valid input, provide help
//   await ctx.reply(
//     "🤖 **Welcome to the Trading Bot!**\n\n" +
//       "Send me:\n" +
//       "• A token address (e.g., `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)\n" +
//       "• A Meteora pool URL (e.g., `/dlmm/PoolAddress`)\n\n" +
//       "I'll help you create liquidity positions!",
//     { parse_mode: "Markdown" }
//   );
// };
