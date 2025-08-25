import { Telegraf, Context } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { generateWeisheepPoster } from "@/services/weisheep-poster.service";

/**
 * Cú pháp:
 * /weisheep <bigText> | <pair> | <tvl> | <pnl> | <refLink> | <qrData?>
 * - bigText  : ví dụ "- $0.16"
 * - pair     : "SOL - USDC"
 * - tvl      : "$181.15"
 * - pnl      : "-0.09%"
 * - refLink  : "https://your.site/r/abc" (sẽ in dưới và dùng làm QR nếu không truyền qrData)
 * - qrData   : (tùy chọn) nội dung QR riêng, nếu không có sẽ dùng refLink
 *
 * Ví dụ:
 * /weisheep -$0.16 | SOL - USDC | $181.15 | -0.09% | https://weisheep.fun/r/jsamv
 * /weisheep -$0.16 | SOL - USDC | $181.15 | -0.09% | weisheep.fun/r/jsamv | https://example.com/qr
 */
export function weisheepCommand(bot: Telegraf<BotContext>) {
  bot.command("weisheep", async (ctx: Context) => {
    try {
      const raw = (ctx.message as any)?.text ?? "";
      const payload = raw.replace(/^\/weisheep(@\w+)?\s*/, "");
      if (!payload.trim()) {
        return (ctx as any).reply(
          "Cú pháp: /weisheep <bigText> | <pair> | <tvl> | <pnl> | <refLink> | <qrData?>"
        );
      }

      const parts = payload.split("|").map((s: string) => s.trim());

      const bigText = parts[0] || "- $0.00";
      const pair = parts[1] || "SOL - USDC";
      const tvl = parts[2] || "$0.00";
      const pnl = parts[3] || "0.00%";
      const ref = parts[4] || "";
      const qr = parts[5] || ref;

      const buffer = await generateWeisheepPoster({
      
        bigText,
        pair,
        tvl,
        pnl,
        refLink: ref,
        qrData: qr,
      });

      await (ctx as any).replyWithPhoto(
        { source: buffer },
        { caption: "weisheep poster ✅" }
      );
    } catch (err) {
     console.error("[weisheep] error:", err);
     await (ctx as any).reply(
       "❌ Failed to generate the poster. Please check the parameters or try again."
     );

    }
  });
}
