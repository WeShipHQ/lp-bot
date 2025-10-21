// import { BotContext } from "@/types/bot.types";
// import { FastifyInstance } from "fastify";

// export async function settingsHandler(
//   ctx: BotContext,
//   _server: FastifyInstance
// ) {
//   ctx.reply(
//     "⚙️ Manage Settings\n\n" +
//       "Your Vault Address: Not set\n\n" +
//       "Gas Priority Fee: Medium (0.0001 SOL)\n\n" +
//       "Default Settings:\nRebalancing Schedule: 1 hr",
//     {
//       reply_markup: {
//         inline_keyboard: [
//           [{ text: "Set Vault Address", callback_data: "set_vault" }],
//           [{ text: "Change Gas Fee", callback_data: "change_gas" }],
//           [{ text: "Edit Schedule", callback_data: "edit_schedule" }],
//         ],
//       },
//     }
//   );
// }

// export async function handleSettingsCallback(
//   ctx: BotContext,
//   _server: FastifyInstance
// ) {
//   const data =
//     "data" in (ctx.callbackQuery ?? {})
//       ? (ctx.callbackQuery as any).data
//       : undefined;
//   switch (data) {
//     case "set_vault":
//       await ctx.answerCbQuery();
//       await ctx.reply("🔑 Please enter your new vault address.");
//       break;
//     case "change_gas":
//       await ctx.answerCbQuery();
//       await ctx.reply("⛽ Please select your desired gas priority fee.");
//       break;
//     case "edit_schedule":
//       await ctx.answerCbQuery();
//       await ctx.reply("🕒 Please choose your rebalancing schedule.");
//       break;
//     default:
//       await ctx.answerCbQuery("Unknown action");
//       break;
//   }
// }
