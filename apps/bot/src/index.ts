import Fastify from "fastify";
import GracefulServer from "@gquittet/graceful-server";
import { randomUUID } from "node:crypto";
import { CONFIG } from "./config";
import server from "@/server";
import { pathToFileURL } from "node:url";

async function init() {
  const fastify = Fastify({
    logger: {
      level:
        CONFIG.LOG_LEVEL ||
        (CONFIG.NODE_ENV === "production" ? "warn" : "debug"),
      transport:
        CONFIG.NODE_ENV === "development"
          ? {
              target: "pino-pretty",
              options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname",
              },
            }
          : undefined,
      redact: ["headers.authorization"],
      serializers: {
        req: (req) => ({
          method: req.method,
          url: req.url,
          headers: req.headers,
          hostname: req.hostname,
          remoteAddress: req.ip,
          remotePort: req.socket?.remotePort,
        }),
        res: (res) => ({
          statusCode: res.statusCode,
          headers: res.getHeaders ? res.getHeaders() : res.headers,
        }),
      },
    },
    genReqId: function (req) {
      // header best practice: don't use "x-" https://www.rfc-editor.org/info/rfc6648 and keep it lowercase
      return (req.headers["request-id"] as string) ?? randomUUID();
    },
    ignoreDuplicateSlashes: true,
    ajv: {
      customOptions: {
        keywords: [""],
      },
    },
  });

  await server(fastify);

  const gracefulServer = GracefulServer(fastify.server, {
    closePromises: [],
  });

  gracefulServer.on(GracefulServer.READY, async () => {
    fastify.log.info("Server is ready");
    await fastify.bot.launch({ dropPendingUpdates: true });
  });

  gracefulServer.on(GracefulServer.SHUTTING_DOWN, () => {
    fastify.log.info("Server is shutting down");
  });

  gracefulServer.on(GracefulServer.SHUTDOWN, (error: any) => {
    fastify.log.info("Server is down because of", error.message);
  });

  try {
    await fastify.listen({ port: CONFIG.PORT });
    gracefulServer.setReady();
  } catch (error) {
    fastify.log.error(error);
    // eslint-disable-next-line n/no-process-exit,unicorn/no-process-exit
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  void init();
}
