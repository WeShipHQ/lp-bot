import { FastifyInstance } from "fastify";
import { registerCorsPlugin } from "./cors";
import { registerDrizzlePlugin } from "./drizzle";
import { registerTelegrafPlugin } from "./telegraf";

export async function registerPlugins(app: FastifyInstance) {
  await registerCorsPlugin(app);
  await registerDrizzlePlugin(app);
  await registerTelegrafPlugin(app);
}
