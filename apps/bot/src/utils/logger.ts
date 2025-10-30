import { CONFIG } from "@/config";
import pino from "pino";

const createLogger = () => {
  const logLevel =
    CONFIG.LOG_LEVEL || (CONFIG.NODE_ENV === "production" ? "warn" : "debug");

  return pino({
    level: logLevel,
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
    base: {
      pid: process.pid,
      // hostname: require("os").hostname(),
      // environment: env.nodeEnv,
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  });
};

export const logger = createLogger();

export const createChildLogger = (bindings: Record<string, any>) => {
  return logger.child(bindings);
};
