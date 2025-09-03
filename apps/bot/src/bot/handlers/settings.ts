import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";

export async function handleSettingsCallback(ctx: BotContext, server: FastifyInstance) {
  const data = 'data' in (ctx.callbackQuery ?? {}) ? (ctx.callbackQuery as any).data : undefined;
  switch (data) {
    case "set_vault":
      await ctx.answerCbQuery();
      await ctx.reply("🔑 Please enter your new vault address.");
      break;
    case "change_gas":
      await ctx.answerCbQuery();
      await ctx.reply("⛽ Please select your desired gas priority fee.");
      break;
    case "edit_schedule":
      await ctx.answerCbQuery();
      await ctx.reply("🕒 Please choose your rebalancing schedule.");
      break;
    default:
      await ctx.answerCbQuery("Unknown action");
      break;
  }
}
