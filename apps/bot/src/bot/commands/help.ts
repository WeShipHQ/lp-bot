import DLMM from "@meteora-ag/dlmm";
import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";

export function helpCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("help", (ctx) => {
    ctx.reply(
      "📖 Read FAQs in docs [here](https://docs.weisheep.fun/faqs) for answers to frequently asked questions.\n\n" +
        "Private beta users can join our [TG group](https://t.me/+tevTmc09Vw44M2E1) for further help and feedback. Access only granted to active users.\n\n" +
        "🤖 Backup Bots: [@weisheep_dark_bot](https://t.me/weisheep_dark_bot) and [@weisheep_light_bot](https://t.me/weisheep_light_bot)",
      { parse_mode: "Markdown" }
    );
  });
}

// import { Telegraf } from "telegraf";
// import { BotContext } from "@/types/bot.types";
// import { SCENE_IDS } from "../config/scenes";

// export function helpCommand(
//   bot: Telegraf<BotContext>,
//   _server: FastifyInstance
// ) {
//   bot.help(async (ctx: BotContext, next) => {
//     const helpMessage = `
// 🤖 *Meteora Liquidity Bot Commands*

// *Basic Commands:*
// /start - Welcome message and main menu
// /help - Show this help message
// /portfolio - View your portfolio (demo)

// *Wallet Commands:*
// /connect_wallet - Connect your Solana wallet
// /balance - Check wallet balance
// /disconnect_wallet - Disconnect wallet

// *Trending Commands:*
// /trending - View trending tokens

// *Position Commands:*
// /create_position - Create new liquidity position
// /my_positions - View all your positions
// /rebalance - Manual rebalance

// *Settings:*
// /auto_rebalance - Toggle auto-rebalancing
// /set_threshold - Set rebalance threshold

// *Support:*
// If you need help, contact our support team.
//     `;

//     // await ctx
//     //   .reply(helpMessage, {
//     //     parse_mode: "Markdown",
//     //   })
//     //   .catch(console.error);
//     console.log("enter");
//     return ctx.scene.enter(SCENE_IDS.POOL_DETAIL_SCENE, {
//       poolAddress: "7q1BaMsFikgMJBMmmzF4nD9mxE6agFASnxGGq58LVd43",
//     });
//   });
// }
