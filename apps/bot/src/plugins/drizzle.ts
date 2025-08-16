import fp from "fastify-plugin";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { db, client } from "../db";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema";

declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
  }
}

export async function registerDrizzlePlugin(app: FastifyInstance) {
  app.register(drizzlePlugin);
}

const drizzlePlugin: FastifyPluginAsync = fp(async (server, _options) => {
  server.decorate("db", db);
  server.addHook("onClose", async (_server) => {
    await client.end();
  });
});

export { drizzlePlugin };
export default drizzlePlugin;
