// import { Telegraf } from "telegraf";
// import { BotContext } from "@/types/bot.types";
// import { FastifyInstance } from "fastify";
// import { settingsHandler } from "../handlers/settings";

// export function settingsCommand(
//   bot: Telegraf<BotContext>,
//   server: FastifyInstance
// ) {
//   bot.command("settings", (ctx) => settingsHandler(ctx, server));

//   bot.on("callback_query", async (ctx) => {
//     const data =
//       "data" in (ctx.callbackQuery ?? {})
//         ? (ctx.callbackQuery as any).data
//         : undefined;
//     if (["set_vault", "change_gas", "edit_schedule"].includes(data)) {
//       const { handleSettingsCallback } = await import("../handlers/settings");
//       await handleSettingsCallback(ctx, server);
//     }
//   });
// }
