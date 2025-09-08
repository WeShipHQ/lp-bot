import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";

export function helpCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("help", async (ctx) => {
    ctx.reply(
      "📖 Read FAQs in docs [here](https://docs.weisheep.fun/faqs) for answers to frequently asked questions.\n\n" +
        "Private beta users can join our [TG group](https://t.me/+tevTmc09Vw44M2E1) for further help and feedback. Access only granted to active users.\n\n" +
        "🤖 Backup Bots: [@weisheep_dark_bot](https://t.me/weisheep_dark_bot) and [@weisheep_light_bot](https://t.me/weisheep_light_bot)",
      { parse_mode: "Markdown" }
    );
  });
}
