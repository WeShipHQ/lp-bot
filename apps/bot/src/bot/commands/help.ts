import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { BotContext } from "@/types/bot.types";

export function helpCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.help(async (ctx: BotContext) => {
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

*Trending Commands:*
/trending - View trending tokens

*Position Commands:*
/create_position - Create new liquidity position
/my_positions - View all your positions
/rebalance - Manual rebalance

*Security Commands:*
/setup-2fa - Enable Two-Factor Authentication
/verify-2fa <code> - Verify 2FA setup code
/2fa-status - Check 2FA status
/disable-2fa - Disable 2FA (contact support)

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
