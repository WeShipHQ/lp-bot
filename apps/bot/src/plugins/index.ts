import { FastifyInstance } from "fastify";
import { registerCorsPlugin } from "./cors";
import { registerDrizzlePlugin } from "./drizzle";
import { registerTelegrafPlugin } from "./telegraf";
import { registerHealthPlugin } from "./health";

export async function registerPlugins(app: FastifyInstance) {
  await registerHealthPlugin(app);
  await registerCorsPlugin(app);
  await registerDrizzlePlugin(app);
  await registerTelegrafPlugin(app);
}
