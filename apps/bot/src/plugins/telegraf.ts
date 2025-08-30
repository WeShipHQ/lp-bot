import fp from "fastify-plugin";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { Telegraf } from "telegraf";
import { CONFIG } from "../config";
import { setupBotCommands } from "../bot";
import { BotContext } from "@/types/bot.types";

declare module "fastify" {
  interface FastifyInstance {
    bot: Telegraf<BotContext>;
  }
}

export async function registerTelegrafPlugin(app: FastifyInstance) {
  app.register(telegrafPlugin);
}

const telegrafPlugin: FastifyPluginAsync = fp(async (server, _options) => {
  if (!CONFIG.TELEGRAM.BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  const bot = new Telegraf<BotContext>(CONFIG.TELEGRAM.BOT_TOKEN);

  await setupBotCommands(bot, server);

  if (CONFIG.TELEGRAM.WEBHOOK_URL) {
    // Webhook mode for production
    await bot.telegram.setWebhook(CONFIG.TELEGRAM.WEBHOOK_URL);
    server.log.info(`Bot webhook set to: ${CONFIG.TELEGRAM.WEBHOOK_URL}`);
  } else {
    // bot.launch({ dropPendingUpdates: true }, () =>
    //   console.log("Bot is starting!")
    // );

    server.log.info("Bot started in polling mode");
  }

  // Decorate Fastify instance with bot
  server.decorate("bot", bot);

  server.addHook("onClose", async () => {
    bot.stop("SIGTERM");
    server.log.info("Bot stopped");
  });
});

export { telegrafPlugin };
export default telegrafPlugin;
