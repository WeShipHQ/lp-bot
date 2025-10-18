import { InlineKeyboardMarkup } from "@telegraf/types";
import { getSolscanLink } from "@/utils/link";

export function getWalletKeyboard(walletAddress: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Transfer all SOL", callback_data: "transfer_all_sol" },
        { text: "Transfer X SOL", callback_data: "transfer_x_sol" },
      ],
      [
        { text: "Transfer all tokens", callback_data: "transfer_all_tokens" },
        { text: "Transfer X tokens", callback_data: "transfer_x_tokens" },
      ],
      [{ text: "Export private key", callback_data: "export_private_key" }],
      [
        {
          text: "View on Solscan",
          url: getSolscanLink("account", walletAddress),
        },
      ],
      [
        { text: "Close", callback_data: "close_wallet" },
        { text: "Refresh", callback_data: "refresh_wallet" },
      ],
    ],
  };
}

/**
 * Get keyboard for transfer confirmation
 */
export function getTransferConfirmKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirm Transfer", callback_data: "confirm_transfer" },
        { text: "❌ Cancel", callback_data: "cancel_transfer" },
      ],
    ],
  };
}
