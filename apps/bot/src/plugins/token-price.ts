import fp from "fastify-plugin";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { createTokenPriceService, TokenPriceService } from "../services/token-price.service";
import Redis from "ioredis";
import { CONFIG } from "../config";

declare module "fastify" {
  interface FastifyInstance {
    tokenPriceService: TokenPriceService;
  }
}

export async function registerTokenPricePlugin(app: FastifyInstance) {
  app.register(tokenPricePlugin);
}

const tokenPricePlugin: FastifyPluginAsync = fp(async (server, _options) => {
  // Initialize Redis client if needed
  let redisClient: Redis | undefined;
  if (CONFIG.REDIS.URL) {
    redisClient = new Redis(CONFIG.REDIS.URL);
  }

  // Create and initialize the price service
  const priceService = createTokenPriceService(redisClient);
  await priceService.initialize();

  // Decorate Fastify instance with the service
  server.decorate("tokenPriceService", priceService);

  // Cleanup on server close
  server.addHook("onClose", async () => {
    await priceService.cleanup();
    server.log.info("TokenPriceService stopped");
  });

  server.log.info("TokenPriceService initialized");
});

export { tokenPricePlugin };
export default tokenPricePlugin;