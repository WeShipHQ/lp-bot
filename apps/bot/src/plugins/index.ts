import { FastifyInstance } from "fastify";
import { registerCorsPlugin } from "./cors";
import { registerDrizzlePlugin } from "./drizzle";
import { registerTokenPricePlugin } from "./token-price";
import { registerTelegrafPlugin } from "./telegraf";
import { registerHealthPlugin } from "./health";
import { registerJobQueuePlugin } from "./job-queue";
import { registerPnlVerificationPlugin } from "./pnl-verification";

export async function registerPlugins(app: FastifyInstance) {
  await registerHealthPlugin(app);
  await registerCorsPlugin(app);
  await registerDrizzlePlugin(app); // Database first
  await registerTelegrafPlugin(app); // Bot before job queue to allow notifications
  await registerTokenPricePlugin(app);
  await registerJobQueuePlugin(app); // Job queue after bot and database
  await registerPnlVerificationPlugin(app); // PnL verification routes
}
