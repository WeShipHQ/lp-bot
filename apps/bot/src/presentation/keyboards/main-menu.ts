import { MessageInlineKeyboard } from "@/domain/message";

export function getMainKeyboard(): MessageInlineKeyboard {
  return {
    type: "inline",
    rows: [
      [{ text: "🚀 Open Position", callbackData: "open_position" }],
      [
        { text: "💼 Portfolio", callbackData: "/portfolio" },
        { text: "💰 Wallet", callbackData: "/wallet" },
      ],
      [
        { text: "🧧 Referral", callbackData: "/referral" },
        { text: "⚙️ Settings", callbackData: "/settings" },
      ],
      [{ text: "❓ Help", callbackData: "/help" }],
    ],
  };
}
