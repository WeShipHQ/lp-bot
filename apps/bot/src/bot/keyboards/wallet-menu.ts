// @ts-expect-error
import { InlineKeyboardMarkup } from "telegraf/typings/core/types/typegram";

export function getWalletKeyboard(walletAddress?: string): InlineKeyboardMarkup {
  const solscanUrl = walletAddress 
    ? `https://solscan.io/account/${walletAddress}`
    : "https://solscan.io";

  return {
    inline_keyboard: [
      [
        { text: "Transfer all SOL", callback_data: "transfer_all_sol" },
        { text: "Transfer X SOL", callback_data: "transfer_x_sol" }
      ],
      [
        { text: "Transfer all tokens", callback_data: "transfer_all_tokens" },
        { text: "Transfer X tokens", callback_data: "transfer_x_tokens" }
      ],
      [{ text: "Export private key", callback_data: "export_private_key" }],
      [{ text: "View on Solscan", url: solscanUrl }],
      [
        { text: "Close", callback_data: "close_wallet" },
        { text: "Refresh", callback_data: "refresh_wallet" }
      ]
    ],
  };
}