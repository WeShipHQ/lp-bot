import Fastify from "fastify";
import GracefulServer from "@gquittet/graceful-server";
import { randomUUID } from "node:crypto";
import { CONFIG } from "./config";
import server from "@/server";
import { pathToFileURL } from "node:url";

async function init() {
  const fastify = Fastify({
    logger: {
      level: CONFIG.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
        },
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

  gracefulServer.on(GracefulServer.READY, () => {
    fastify.log.info("Server is ready");
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
