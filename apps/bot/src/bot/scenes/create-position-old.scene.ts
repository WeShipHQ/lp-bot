// import { Scenes } from "telegraf";
// import { BotContext } from "@/types/bot.types";
// import { SCENE_IDS } from "../config/scenes";
// import { MessageService } from "@/services/message.service";
// import { MeteoraPoolData } from "@/types/meteora.types";
// import { poolService } from "@/services/pool.service";
// import { jupiterService } from "@/services/jupiter.service";
// import { meteoraDlmmService } from "@/services/meteora/dlmm.service";
// import { message } from "telegraf/filters";
// import { SOL_MINT } from "@/config/constants";
// import { delay } from "@/utils/misc";

// type SceneState = {
//   poolAddress?: string;
//   poolData?: MeteoraPoolData;
//   strategy?: string;
//   selectedSide?: string;
//   amount?: number;
//   step?:
//     | "strategy"
//     | "side"
//     | "amount"
//     | "custom_amount"
//     | "confirmation"
//     | "preview";
// };

// export const createPositionScene = new Scenes.BaseScene<BotContext>(
//   SCENE_IDS.CREATE_POSITION_SCENE
// );

// createPositionScene.enter(async (ctx) => {
//   try {
//     const state = ctx.scene.state as SceneState;
//     const poolAddress = state.poolAddress;

//     if (!poolAddress) {
//       await ctx.reply(MessageService.getErrorMessage("Pool address not found"));
//       return ctx.scene.leave();
//     }

//     const poolData = await poolService.getPool(poolAddress, "dlmm");
//     if (!poolData) {
//       await ctx.reply(MessageService.getErrorMessage("Pool not found"));
//       return ctx.scene.leave();
//     }

//     ctx.scene.state = { ...state, poolData, step: "strategy" };

//     await ctx.reply(
//       `🎯 **Choose your liquidity strategy for ${poolData.token_a_symbol}/${poolData.token_b_symbol}:**\n\n` +
//         `💰 **Spot**: Provide liquidity around current price\n` +
//         `📈 **Curve**: Auto-rebalancing across price range\n` +
//         `🎯 **Single-Sided**: Provide only one token`,
//       {
//         parse_mode: "Markdown",
//         reply_markup: {
//           inline_keyboard: [
//             [
//               { text: "💰 Spot", callback_data: "strategy_spot" },
//               { text: "📈 Curve", callback_data: "strategy_curve" },
//             ],
//             [{ text: "🎯 Single-Sided", callback_data: "strategy_single" }],
//             // [{ text: "🔙 Back", callback_data: "back_to_pool" }],
//           ],
//         },
//       }
//     );
//   } catch (error) {
//     console.error("Error in create position scene:", error);
//     await ctx.reply(
//       MessageService.getErrorMessage("Failed to load position details")
//     );
//     return ctx.scene.leave();
//   }
// });

// // Strategy selection handlers
// createPositionScene.action(/^strategy_(spot|curve|single)$/, async (ctx) => {
//   const strategy = ctx.match[1];
//   const state = ctx.scene.state as SceneState;

//   ctx.scene.state = { ...state, strategy };

//   if (strategy === "single") {
//     await showSideSelection(ctx);
//   } else {
//     await showAmountInput(ctx);
//   }
// });

// // Side selection for single-sided strategy
// async function showSideSelection(ctx: BotContext) {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   ctx.scene.state = { ...state, step: "side" };

//   await ctx.reply(
//     `🎯 **Single-Sided Liquidity**\n\n` +
//       `Choose which token you want to provide:\n\n` +
//       `🪙 **${poolData.token_a_symbol}**: ${poolData.token_a_symbol}\n` +
//       `🪙 **${poolData.token_b_symbol}**: ${poolData.token_b_symbol}`,
//     {
//       parse_mode: "Markdown",
//       reply_markup: {
//         inline_keyboard: [
//           [
//             {
//               text: `🪙 ${poolData.token_a_symbol}`,
//               callback_data: `side_${poolData.token_a_symbol}`,
//             },
//             {
//               text: `🪙 ${poolData.token_b_symbol}`,
//               callback_data: `side_${poolData.token_b_symbol}`,
//             },
//           ],
//         ],
//       },
//     }
//   );
// }

// createPositionScene.action(/^side_(.+)$/, async (ctx) => {
//   const selectedSide = ctx.match[1];
//   const state = ctx.scene.state as SceneState;

//   ctx.scene.state = { ...state, selectedSide };
//   await showAmountInput(ctx);
// });

// // Amount input
// async function showAmountInput(ctx: BotContext) {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   ctx.scene.state = { ...state, step: "amount" };

//   await ctx.reply(
//     `💰 **Enter Amount**\n\n` +
//       `Pool: **${poolData.token_a_symbol}/${poolData.token_b_symbol}**\n` +
//       `Strategy: **${state.strategy?.toUpperCase()}**\n` +
//       (state.selectedSide ? `Side: **${state.selectedSide}**\n` : "") +
//       `\nHow much SOL would you like to invest?`,
//     {
//       parse_mode: "Markdown",
//       reply_markup: {
//         inline_keyboard: [
//           [
//             { text: "0.1 SOL", callback_data: "amount_0.1" },
//             { text: "0.5 SOL", callback_data: "amount_0.5" },
//           ],
//           [
//             { text: "1 SOL", callback_data: "amount_1" },
//             { text: "5 SOL", callback_data: "amount_5" },
//           ],
//           [
//             { text: "10 SOL", callback_data: "amount_10" },
//             { text: "✏️ Custom", callback_data: "amount_custom" },
//           ],
//           // [
//           //   {
//           //     text: "🔙 Back",
//           //     callback_data:
//           //       state.strategy === "single"
//           //         ? "back_to_side"
//           //         : "back_to_strategy",
//           //   },
//           // ],
//         ],
//       },
//     }
//   );
// }

// createPositionScene.action(/^amount_([\d.]+)$/, async (ctx) => {
//   const amount = parseFloat(ctx.match[1]);
//   const state = ctx.scene.state as SceneState;

//   ctx.scene.state = { ...state, amount };
//   await showConfirmation(ctx);
// });

// createPositionScene.action("amount_custom", async (ctx) => {
//   const state = ctx.scene.state as SceneState;
//   ctx.scene.state = { ...state, step: "custom_amount" };

//   await ctx.reply(
//     "✏️ **Custom Amount**\n\n" +
//       "Please enter the amount of SOL you want to invest:\n\n" +
//       "Example: `1.5` for 1.5 SOL",
//     {
//       parse_mode: "Markdown",
//       reply_markup: {
//         inline_keyboard: [
//           [{ text: "🔙 Back", callback_data: "back_to_amount" }],
//         ],
//       },
//     }
//   );
// });

// // Custom amount input handler
// createPositionScene.on(message("text"), async (ctx) => {
//   const state = ctx.scene.state as SceneState;

//   if (state.step === "custom_amount") {
//     const amountText = ctx.message.text.trim();
//     const amount = parseFloat(amountText);

//     if (isNaN(amount) || amount <= 0) {
//       await ctx.reply(MessageService.getErrorMessage("Invalid amount"));
//       return;
//     }

//     ctx.scene.state = { ...state, amount };
//     await showConfirmation(ctx);
//   }
// });

// // Confirmation step
// async function showConfirmation(ctx: BotContext) {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   ctx.scene.state = { ...state, step: "confirmation" };

//   const confirmationText =
//     `📋 **Confirm Position Details**\n\n` +
//     `🏊 **Pool**: ${poolData.token_a_symbol}/${poolData.token_b_symbol}\n` +
//     `🎯 **Strategy**: ${state.strategy?.toUpperCase()}\n` +
//     (state.selectedSide ? `🪙 **Side**: ${state.selectedSide}\n` : "") +
//     `💰 **Amount**: ${state.amount} SOL\n\n` +
//     `Do you want to proceed with this position?`;

//   await ctx.reply(confirmationText, {
//     parse_mode: "Markdown",
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "✅ Yes, Continue", callback_data: "confirm_yes" },
//           { text: "❌ No, Cancel", callback_data: "confirm_no" },
//         ],
//         [{ text: "🔙 Back", callback_data: "back_to_amount" }],
//       ],
//     },
//   });
// }

// createPositionScene.action("confirm_no", async (ctx) => {
//   await ctx.editMessageText(
//     "❌ **Position creation cancelled**\n\nYou can start over anytime!",
//     { parse_mode: "Markdown" }
//   );
//   return ctx.scene.leave();
// });

// createPositionScene.action("confirm_yes", async (ctx) => {
//   await showPositionPreview(ctx);
// });

// // Position preview with calculations
// async function showPositionPreview(ctx: BotContext) {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   ctx.scene.state = { ...state, step: "preview" };

//   const loadingMsg = await ctx.editMessageText(
//     "⏳ **Calculating position preview...**",
//     { parse_mode: "Markdown" }
//   );

//   try {
//     const preview = await calculatePositionPreview(
//       state.strategy!,
//       state.amount!,
//       poolData,
//       state.selectedSide
//     );

//     const previewText =
//       `🔍 **Position Preview**\n\n` +
//       `🏊 **Pool**: ${poolData.token_a_symbol}/${poolData.token_b_symbol}\n` +
//       `🎯 **Strategy**: ${state.strategy?.toUpperCase()}\n` +
//       `💰 **Investment**: ${state.amount} SOL\n\n` +
//       `📊 **Estimated Allocation**:\n` +
//       `🪙 **${poolData.token_a_symbol}**: ${preview.tokenAAmount}\n` +
//       `🪙 **${poolData.token_b_symbol}**: ${preview.tokenBAmount}\n\n` +
//       (preview.rangeMin !== "N/A"
//         ? `📈 **Price Range**:\n` +
//           `📉 **Min**: ${preview.rangeMin}\n` +
//           `📈 **Max**: ${preview.rangeMax}\n\n`
//         : "") +
//       `🔄 **Auto-rebalancing**: ${preview.autoRebalancing ? "Yes" : "No"}\n\n` +
//       `⚠️ **Ready to create position?**`;

//     await ctx.reply(previewText, {
//       parse_mode: "Markdown",
//       reply_markup: {
//         inline_keyboard: [
//           [
//             { text: "🚀 Create Position", callback_data: "final_confirm_yes" },
//             { text: "❌ Cancel", callback_data: "final_confirm_no" },
//           ],
//           [{ text: "🔙 Back", callback_data: "back_to_confirmation" }],
//         ],
//       },
//     });
//   } catch (error) {
//     console.error("Error calculating position preview:", error);
//     await ctx.reply(
//       "❌ **Error calculating position preview**\n\nPlease try again later.",
//       { parse_mode: "Markdown" }
//     );
//     return ctx.scene.leave();
//   }
// }

// createPositionScene.action("final_confirm_no", async (ctx) => {
//   await ctx.reply(
//     "❌ **Position creation cancelled**\n\nYou can start over anytime!",
//     { parse_mode: "Markdown" }
//   );
//   return ctx.scene.leave();
// });

// createPositionScene.action("final_confirm_yes", async (ctx) => {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   const processingMsg = await ctx.editMessageText(
//     "⏳ **Creating your position...**\n\nThis may take a few moments.",
//     { parse_mode: "Markdown" }
//   );

//   try {
//     // const result = await positionService.createPosition({
//     //   poolAddress: poolData.pool_address,
//     //   strategy: state.strategy!,
//     //   amount: state.amount!,
//     //   selectedSide: state.selectedSide,
//     //   userAddress: ctx.from?.id.toString() || "",
//     // });
//     await delay(200);

//     const result = {
//       success: true,
//       positionId: "123",
//       signature: "123",
//       error: "Some error",
//     };

//     if (result.success) {
//       await ctx.editMessageText(
//         `🎉 **Position Created Successfully!**\n\n` +
//           `📊 **Position ID**: \`${result.positionId}\`\n` +
//           `🏊 **Pool**: ${poolData.token_a_symbol}/${poolData.token_b_symbol}\n` +
//           `🎯 **Strategy**: ${state.strategy?.toUpperCase()}\n` +
//           `💰 **Amount**: ${state.amount} SOL\n\n` +
//           `🔗 **Transaction**: [View on Solscan](https://solscan.io/tx/${result.signature})`,
//         {
//           parse_mode: "Markdown",
//           reply_markup: {
//             inline_keyboard: [
//               [
//                 {
//                   text: "📊 View Position",
//                   callback_data: `view_position_${result.positionId}`,
//                 },
//               ],
//               [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
//             ],
//           },
//         }
//       );
//     } else {
//       await ctx.editMessageText(
//         `❌ **Position Creation Failed**\n\n` +
//           `Error: ${result.error}\n\n` +
//           `Please try again later.`,
//         {
//           parse_mode: "Markdown",
//           reply_markup: {
//             inline_keyboard: [
//               [{ text: "🔄 Try Again", callback_data: "retry_position" }],
//               [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
//             ],
//           },
//         }
//       );
//     }
//   } catch (error) {
//     console.error("Error creating position:", error);
//     await ctx.editMessageText(
//       "❌ **Unexpected error occurred**\n\nPlease try again later.",
//       {
//         parse_mode: "Markdown",
//         reply_markup: {
//           inline_keyboard: [
//             [{ text: "🔄 Try Again", callback_data: "retry_position" }],
//             [{ text: "🏠 Main Menu", callback_data: "main_menu" }],
//           ],
//         },
//       }
//     );
//   }

//   return ctx.scene.leave();
// });

// // Navigation handlers
// createPositionScene.action("back_to_strategy", async (ctx) => {
//   const state = ctx.scene.state as SceneState;
//   const poolData = state.poolData!;

//   ctx.scene.state = { ...state, step: "strategy", selectedSide: undefined };

//   await ctx.editMessageText(
//     `🎯 **Choose your liquidity strategy for ${poolData.token_a_symbol}/${poolData.token_b_symbol}:**\n\n` +
//       `💰 **Spot**: Provide liquidity around current price\n` +
//       `📈 **Curve**: Auto-rebalancing across price range\n` +
//       `🎯 **Single-Sided**: Provide only one token`,
//     {
//       parse_mode: "Markdown",
//       reply_markup: {
//         inline_keyboard: [
//           [
//             { text: "💰 Spot", callback_data: "strategy_spot" },
//             { text: "📈 Curve", callback_data: "strategy_curve" },
//           ],
//           [{ text: "🎯 Single-Sided", callback_data: "strategy_single" }],
//           [{ text: "🔙 Back", callback_data: "back_to_pool" }],
//         ],
//       },
//     }
//   );
// });

// createPositionScene.action("back_to_side", async (ctx) => {
//   await showSideSelection(ctx);
// });

// createPositionScene.action("back_to_amount", async (ctx) => {
//   await showAmountInput(ctx);
// });

// createPositionScene.action("back_to_confirmation", async (ctx) => {
//   await showConfirmation(ctx);
// });

// createPositionScene.action("back_to_pool", async (ctx) => {
//   const state = ctx.scene.state as SceneState;
//   if (state.poolAddress) {
//     return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
//       poolAddress: state.poolAddress,
//     });
//   }
//   return ctx.scene.leave();
// });

// async function calculatePositionPreview(
//   strategy: string,
//   amount: number,
//   poolInfo: MeteoraPoolData,
//   selectedSide?: string
// ) {
//   // For single-sided strategy
//   if (strategy === "single") {
//     if (selectedSide === poolInfo.token_a_symbol) {
//       // Converting SOL to token A
//       if (poolInfo.token_a_mint === SOL_MINT) {
//         return {
//           rangeMin: "N/A",
//           rangeMax: "N/A",
//           tokenAAmount: amount.toString(),
//           tokenBAmount: "0",
//           autoRebalancing: false,
//         };
//       } else {
//         try {
//           const orderResponse = await jupiterService.getOrder({
//             inputMint: SOL_MINT,
//             outputMint: poolInfo.token_a_mint,
//             amount: (amount * 1e9).toString(), // Convert SOL to lamports
//           });
//           // TODO fix decimals
//           const tokenAAmount = (
//             parseInt(orderResponse.outAmount) / Math.pow(10, 6)
//           ).toString();

//           return {
//             rangeMin: "N/A",
//             rangeMax: "N/A",
//             tokenAAmount,
//             tokenBAmount: "0",
//             autoRebalancing: false,
//           };
//         } catch (error) {
//           console.error("Error getting Jupiter quote for token A:", error);
//           return {
//             rangeMin: "N/A",
//             rangeMax: "N/A",
//             tokenAAmount: "Error calculating",
//             tokenBAmount: "0",
//             autoRebalancing: false,
//           };
//         }
//       }
//     } else {
//       if (poolInfo.token_b_mint === SOL_MINT) {
//         return {
//           rangeMin: "N/A",
//           rangeMax: "N/A",
//           tokenAAmount: "0",
//           tokenBAmount: amount.toString(),
//           autoRebalancing: false,
//         };
//       } else {
//         try {
//           const orderResponse = await jupiterService.getOrder({
//             inputMint: SOL_MINT,
//             outputMint: poolInfo.token_b_mint,
//             amount: (amount * 1e9).toString(), // Convert SOL to lamports
//           });

//           const tokenBAmount = (
//             parseInt(orderResponse.outAmount) / Math.pow(10, 6)
//           ).toString();

//           return {
//             rangeMin: "N/A",
//             rangeMax: "N/A",
//             tokenAAmount: "0",
//             tokenBAmount,
//             autoRebalancing: false,
//           };
//         } catch (error) {
//           console.error("Error getting Jupiter quote for token B:", error);
//           return {
//             rangeMin: "N/A",
//             rangeMax: "N/A",
//             tokenAAmount: "0",
//             tokenBAmount: "Error calculating",
//             autoRebalancing: false,
//           };
//         }
//       }
//     }
//   }

//   // For spot and curve strategies, split amount 50/50
//   const halfAmount = amount / 2;
//   const halfAmountLamports = (halfAmount * 1e9).toString();

//   let tokenAAmount = "0";
//   let tokenBAmount = "0";

//   try {
//     // Calculate token A amount
//     if (poolInfo.token_a_mint === SOL_MINT) {
//       // Token A is SOL, no conversion needed
//       tokenAAmount = halfAmount.toString();
//     } else {
//       // Convert SOL to token A
//       const orderResponseA = await jupiterService.getOrder({
//         inputMint: SOL_MINT,
//         outputMint: poolInfo.token_a_mint,
//         amount: halfAmountLamports,
//       });

//       tokenAAmount = (
//         parseInt(orderResponseA.outAmount) / Math.pow(10, 6)
//       ).toFixed(6);
//     }

//     // Calculate token B amount
//     if (poolInfo.token_b_mint === SOL_MINT) {
//       // Token B is SOL, no conversion needed
//       tokenBAmount = halfAmount.toString();
//     } else {
//       // Convert SOL to token B
//       const orderResponseB = await jupiterService.getOrder({
//         inputMint: SOL_MINT,
//         outputMint: poolInfo.token_b_mint,
//         amount: halfAmountLamports,
//       });

//       tokenBAmount = (
//         parseInt(orderResponseB.outAmount) / Math.pow(10, 6)
//       ).toFixed(6);
//     }
//   } catch (error) {
//     console.error("Error getting Jupiter quotes:", error);
//     tokenAAmount = "Error calculating";
//     tokenBAmount = "Error calculating";
//   }

//   const { fromPrice, toPrice } = await meteoraDlmmService.getPriceRange(
//     poolInfo.pool_address
//   );

//   return {
//     rangeMin: fromPrice,
//     rangeMax: toPrice,
//     tokenAAmount,
//     tokenBAmount,
//     autoRebalancing: strategy === "curve" || strategy === "spot",
//   };
// }
