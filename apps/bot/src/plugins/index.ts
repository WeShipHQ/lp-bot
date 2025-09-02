import { FastifyInstance } from "fastify";
import { registerCorsPlugin } from "./cors";
import { registerDrizzlePlugin } from "./drizzle";
import { registerTokenPricePlugin } from "./token-price";
import { registerTelegrafPlugin } from "./telegraf";
import { registerHealthPlugin } from "./health";

export async function registerPlugins(app: FastifyInstance) {
  await registerHealthPlugin(app);
  await registerCorsPlugin(app);
  await registerDrizzlePlugin(app);
  await registerTokenPricePlugin(app); // Register BEFORE telegraf
  await registerTelegrafPlugin(app);
}
