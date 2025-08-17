// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getWalletKeyboard(userId: string, walletAddress: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Transfer all SOL", callback_data: `transfer_all_sol:${userId}` },
        { text: "Transfer X SOL", callback_data: `transfer_x_sol:${userId}` }
      ],
      [
        { text: "Transfer all tokens", callback_data: `transfer_all_tokens:${userId}` },
        { text: "Transfer X tokens", callback_data: `transfer_x_tokens:${userId}` }
      ],
      [
        { text: "Export private key", callback_data: `export_private_key:${userId}` }
      ],
      [
        { text: "🔍 View on Solscan", url: `https://solscan.io/account/${walletAddress}` }
      ],
      [
        { text: "Close", callback_data: `close_wallet:${userId}` },
        { text: "Refresh", callback_data: `refresh_wallet:${userId}` }
      ]
    ],
  };
}