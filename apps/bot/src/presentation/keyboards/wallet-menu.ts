import { InlineKeyboardMarkup } from "@telegraf/types";
import { getSolscanLink } from "@/utils/link";
import { WALLET_CALLBACKS } from "../constants/wallet.callbacks";

export function getWalletKeyboard(walletAddress: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Transfer all SOL", callback_data: WALLET_CALLBACKS.transfer.solAll },
        { text: "Transfer X SOL", callback_data: WALLET_CALLBACKS.transfer.solAmount },
      ],
      [
        { text: "Transfer all tokens", callback_data: WALLET_CALLBACKS.transfer.tokenAll },
        { text: "Transfer X tokens", callback_data: WALLET_CALLBACKS.transfer.tokenAmount },
      ],
      [{ text: "Export private key", callback_data: WALLET_CALLBACKS.export.privateKey }],
      [
        {
          text: "View on Solscan",
          url: getSolscanLink("account", walletAddress),
        },
      ],
      [
        { text: "Close", callback_data: WALLET_CALLBACKS.ui.close },
        { text: "Refresh", callback_data: WALLET_CALLBACKS.ui.refresh },
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
        { text: "✅ Confirm Transfer", callback_data: WALLET_CALLBACKS.transfer.confirm },
        { text: "❌ Cancel", callback_data: WALLET_CALLBACKS.transfer.cancel },
      ],
    ],
  };
}
