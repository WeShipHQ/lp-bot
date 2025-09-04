import { CONFIG } from "@/config";
import pino from "pino";

const createLogger = () => {
  const logLevel =
    CONFIG.LOG_LEVEL || (CONFIG.NODE_ENV === "production" ? "warn" : "debug");

  return pino({
    level: "debug",
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

// Helper function to create child loggers
export const createChildLogger = (bindings: Record<string, any>) => {
  return logger.child(bindings);
};

// import { CONFIG } from "../config";

// export interface LogContext {
//   [key: string]: any;
// }

// export class Logger {
//   private logLevel: string;

//   constructor() {
//     this.logLevel = CONFIG.LOG_LEVEL;
//   }

//   private shouldLog(level: string): boolean {
//     const levels = ["error", "warn", "info", "debug"];
//     const currentLevelIndex = levels.indexOf(this.logLevel);
//     const messageLevelIndex = levels.indexOf(level);
//     return messageLevelIndex <= currentLevelIndex;
//   }

//   private formatMessage(
//     level: string,
//     message: string,
//     context?: LogContext
//   ): string {
//     const timestamp = new Date().toISOString();
//     const contextStr = context ? ` ${JSON.stringify(context)}` : "";
//     return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
//   }

//   error(message: string, context?: LogContext): void {
//     if (this.shouldLog("error")) {
//       console.error(this.formatMessage("error", message, context));
//     }
//   }

//   warn(message: string, context?: LogContext): void {
//     if (this.shouldLog("warn")) {
//       console.warn(this.formatMessage("warn", message, context));
//     }
//   }

//   info(message: string, context?: LogContext): void {
//     if (this.shouldLog("info")) {
//       console.info(this.formatMessage("info", message, context));
//     }
//   }

//   debug(message: string, context?: LogContext): void {
//     if (this.shouldLog("debug")) {
//       console.debug(this.formatMessage("debug", message, context));
//     }
//   }
// }

// // Export singleton instance
// export const logger = new Logger();
