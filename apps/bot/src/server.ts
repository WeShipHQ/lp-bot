// import path from "node:path";
// import AutoLoad from "@fastify/autoload";
// import Cors from "@fastify/cors";
import Helmet from "@fastify/helmet";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import UnderPressure from "@fastify/under-pressure";
import { FastifyInstance } from "fastify";
import { CONFIG } from "./config";
import { registerPlugins } from "./plugins";

const isDevelopment = CONFIG.NODE_ENV === "development";

export default async function createServer(fastify: FastifyInstance) {
  // Set sensible default security headers
  await fastify.register(Helmet, {
    global: true,
    contentSecurityPolicy: !isDevelopment,
    crossOriginEmbedderPolicy: !isDevelopment,
  });

  // Enables the use of CORS in a Fastify application
  // await fastify.register(Cors, {
  //   origin: false,
  // });

  // await fastify.register(AutoLoad, {
  //   dir: path.join(__dirname, "plugins"),
  //   dirNameRoutePrefix: false,
  // });

  // Register custom plugins (including Telegraf bot)
  await registerPlugins(fastify);

  await fastify.register(UnderPressure);

  return fastify.withTypeProvider<TypeBoxTypeProvider>();
}
