import { Telegraf } from "telegraf";
import { BotContext } from "@/types/bot.types";
import { FastifyInstance } from "fastify";

export function settingsCommand(bot: Telegraf<BotContext>, server: FastifyInstance) {
  bot.command("settings", (ctx) => {
    ctx.reply(
      "⚙️ Manage Settings\n\n" +
        "Your Vault Address: Not set\n\n" +
        "Gas Priority Fee: Medium (0.0001 SOL)\n\n" +
        "Default Settings:\nRebalancing Schedule: 1 hr",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Set Vault Address", callback_data: "set_vault" }],
            [{ text: "Change Gas Fee", callback_data: "change_gas" }],
            [{ text: "Edit Schedule", callback_data: "edit_schedule" }],
          ],
        },
      }
    );
  });

  bot.on("callback_query", async (ctx) => {
    const data = 'data' in (ctx.callbackQuery ?? {}) ? (ctx.callbackQuery as any).data : undefined;
    if (["set_vault", "change_gas", "edit_schedule"].includes(data)) {
      const { handleSettingsCallback } = await import("../handlers/settings");
      await handleSettingsCallback(ctx, server);
    }
  });
}
