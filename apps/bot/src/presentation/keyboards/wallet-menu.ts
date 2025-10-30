import { MessageInlineKeyboard } from "@/domain/message";
import { getSolscanLink } from "@/utils/link";
import { WALLET_CALLBACKS } from "../constants/wallet.callbacks";

export function getWalletKeyboard(walletAddress: string): MessageInlineKeyboard {
  return {
    type: "inline",
    rows: [
      [
        { text: "Transfer all SOL", callbackData: WALLET_CALLBACKS.transfer.solAll },
        { text: "Transfer X SOL", callbackData: WALLET_CALLBACKS.transfer.solAmount },
      ],
      [
        { text: "Transfer all tokens", callbackData: WALLET_CALLBACKS.transfer.tokenAll },
        { text: "Transfer X tokens", callbackData: WALLET_CALLBACKS.transfer.tokenAmount },
      ],
      [{ text: "Export private key", callbackData: WALLET_CALLBACKS.export.privateKey }],
      [
        {
          text: "View on Solscan",
          url: getSolscanLink("account", walletAddress),
        },
      ],
      [
        { text: "Close", callbackData: WALLET_CALLBACKS.ui.close },
        { text: "Refresh", callbackData: WALLET_CALLBACKS.ui.refresh },
      ],
    ],
  };
}

/**
 * Get keyboard for transfer confirmation
 */
export function getTransferConfirmKeyboard(): MessageInlineKeyboard {
  return {
    type: "inline",
    rows: [
      [
        { text: "✅ Confirm Transfer", callbackData: WALLET_CALLBACKS.transfer.confirm },
        { text: "❌ Cancel", callbackData: WALLET_CALLBACKS.transfer.cancel },
      ],
    ],
  };
}
