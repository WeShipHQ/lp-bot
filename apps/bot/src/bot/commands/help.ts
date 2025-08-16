import { Telegraf, Context } from "telegraf";
import { FastifyInstance } from "fastify";

export function helpCommand(bot: Telegraf, _server: FastifyInstance) {
  bot.help(async (ctx: Context) => {
    const helpMessage = `
🤖 *Meteora Liquidity Bot Commands*

*Basic Commands:*
/start - Welcome message and main menu
/help - Show this help message
/portfolio - View your portfolio (demo)

*Wallet Commands:*
/connect_wallet - Connect your Solana wallet
/balance - Check wallet balance
/disconnect_wallet - Disconnect wallet

*Position Commands:*
/create_position - Create new liquidity position
/my_positions - View all your positions
/rebalance - Manual rebalance

*Settings:*
/auto_rebalance - Toggle auto-rebalancing
/set_threshold - Set rebalance threshold

*Support:*
If you need help, contact our support team.
    `;

    await ctx
      .reply(helpMessage, {
        parse_mode: "Markdown",
      })
      .catch(console.error);
  });
}
