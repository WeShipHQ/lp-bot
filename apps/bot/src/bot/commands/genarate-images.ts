import { Telegraf, Context } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { generateWeisheepPoster } from "@/services/weisheep-poster.service";

/**
 * Cú pháp:
 * /generate <highlightedText> | <tradingPair> | <totalValueLocked> | <profitAndLoss> | <referralLink> | <qrCodeData?> | <backgroundTemplate?>
 * - highlightedText  : ví dụ "+ $0.91"
 * - tradingPair      : "SOL - USDC"
 * - totalValueLocked : "$181.15"
 * - profitAndLoss    : "+4.88%"
 * - referralLink     : dùng cho dòng Transaction (hiện "View on Solscan") và QR nếu không có qrCodeData
 * - qrCodeData       : (tùy chọn) nội dung QR riêng
 * - backgroundTemplate : 1 | 2 | 3 để đổi template nền
 */
export function generateImageCommand(bot: Telegraf<BotContext>) {
  bot.command("generate", async (telegramContext: Context) => {
    try {
      const rawMessageText = (telegramContext.message as any)?.text ?? "";
      const payload = rawMessageText.replace(/^\/generate(@\w+)?\s*/, "");
      if (!payload.trim()) {
        return (telegramContext as any).reply(
          "Cú pháp: /generate <highlightedText> | <tradingPair> | <totalValueLocked> | <profitAndLoss> | <referralLink> | <qrCodeData?> | <backgroundTemplate?>"
        );
      }

      const parts = payload.split("|").map((segment: string) => segment.trim());

      let highlightedText = parts[0] || "- $0.00";
      highlightedText = highlightedText.replace(/^\/generate\s*/i, "").trim();

      const tradingPair = parts[1] || "SOL - USDC";
      const totalValueLocked = parts[2] || "$0.00";
      const profitAndLoss = parts[3] || "0.00%";
      const referralLink = parts[4] || "";
      const qrCodeData = parts[5] || referralLink;
      let backgroundImagePath = parts[6] || undefined;

      if (backgroundImagePath === "1")
        backgroundImagePath = "src/assets/images/template-flex.png";
      else if (backgroundImagePath === "2")
        backgroundImagePath = "src/assets/images/template-flex-2.webp";
      else if (backgroundImagePath === "3")
        backgroundImagePath = "src/assets/images/template-flex-3.png";

      let highlightedTextColor = "#FF2D2D";
      if (/^\s*\+/.test(highlightedText)) highlightedTextColor = "#22C55E";
      else if (/^\s*-/.test(highlightedText)) highlightedTextColor = "#FF2D2D";

      // ====== Tạo poster ======
      const posterBuffer = await generateWeisheepPoster({
        highlightedText,
        tradingPair,
        totalValueLocked,
        profitAndLoss,
        referralLink,
        qrCodeData,
        backgroundImagePath,
        highlightedTextColor,
      });

      // ====== MESSAGE TRẠNG THÁI ======
      const extractedMoney = (highlightedText.match(/\$[\d.,]+/) || [
        "$0.00",
      ])[0];
      const extractedPercentage = (profitAndLoss.match(/[-+]?[\d.,]+%/) || [
        profitAndLoss,
      ])[0];
      const statusMessage =
        `✅ <b>Position Closed</b>\n\n` +
        `PnL: <b>${extractedMoney}</b> (<b>${extractedPercentage}</b>)\n` +
        (referralLink
          ? `Transaction: <a href="${referralLink}">View on Solscan</a>`
          : `Transaction: <i>(no link)</i>`);

      await (telegramContext as any).reply(statusMessage, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      await (telegramContext as any).replyWithPhoto({ source: posterBuffer });
    } catch (error) {
      console.error("[weisheep] error:", error);
      await (telegramContext as any).reply(
        "❌ Failed to generate the poster. Please check the parameters or try again."
      );
    }
  });
}
