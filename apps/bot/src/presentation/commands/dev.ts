import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";
import { DISABLE_LINK_PREVIEW } from "../handlers";

export function devCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("dev", async (ctx) => {
    return ctx.replyWithMarkdown(`Dev command`, DISABLE_LINK_PREVIEW);
  });
}
