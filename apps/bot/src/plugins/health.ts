import { FastifyInstance } from "fastify";
import pkg from "../../package.json" assert { type: "json" };

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string;
  version: string;
}

export async function registerHealthPlugin(app: FastifyInstance) {
  // Health check endpoint
  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: pkg.version || "unknown",
    };
  });

  // Readiness check
  app.get("/ready", async () => {
    return { status: "ready" };
  });
}
