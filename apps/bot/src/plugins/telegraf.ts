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
  // Validate bot token
  if (!CONFIG.TELEGRAM.BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  // Create Telegraf instance
  const bot = new Telegraf<BotContext>(CONFIG.TELEGRAM.BOT_TOKEN);

  // Setup bot commands and middleware
  await setupBotCommands(bot, server);

  // Start bot
  if (CONFIG.TELEGRAM.WEBHOOK_URL) {
    // Webhook mode for production
    await bot.telegram.setWebhook(CONFIG.TELEGRAM.WEBHOOK_URL);
    server.log.info(`Bot webhook set to: ${CONFIG.TELEGRAM.WEBHOOK_URL}`);
  } else {
    // Polling mode for development
    bot.launch();
    server.log.info("Bot started in polling mode");
  }

  // Decorate Fastify instance with bot
  server.decorate("bot", bot);

  // Graceful shutdown
  server.addHook("onClose", async () => {
    bot.stop("SIGTERM");
    server.log.info("Bot stopped");
  });
});

export { telegrafPlugin };
export default telegrafPlugin;
