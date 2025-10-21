// import { Telegraf } from "telegraf";
// import { FastifyInstance } from "fastify";
// import { BotContext } from "@/types/bot.types";
// import { portfolioHandler } from "./portfolio";
// import { walletHandler } from "./wallet";
// import { helpHandler } from "./help";
// import { settingsHandler } from "./settings";

// export function registerGlobalCallbacks(
//   bot: Telegraf<BotContext>,
//   server: FastifyInstance
// ) {
//   // Handle all callback data starting with "/"
//   bot.action(/^\/(.+)$/, async (ctx, next) => {
//     const command = ctx.match[1];

//     await ctx.answerCbQuery();

//     switch (command) {
//       case "portfolio":
//         return portfolioHandler(ctx);
//       case "wallet":
//         return walletHandler(ctx, server);

//       case "help":
//         return helpHandler(ctx, server);

//       case "settings":
//         return settingsHandler(ctx, server);

//       default:
//         return next();
//     }
//   });
// }
