import { Telegraf } from "telegraf";
import { FastifyInstance } from "fastify";
import { walletHandler } from "../handlers";
import { BotContext } from "@/types/bot.types";

export function walletCommand(
  bot: Telegraf<BotContext>,
  _server: FastifyInstance
) {
  bot.command("wallet", (ctx) => walletHandler(ctx, _server));
}
