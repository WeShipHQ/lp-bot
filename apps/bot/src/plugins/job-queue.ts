import fp from "fastify-plugin";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";
import { container, DI_TOKENS } from '@/infrastructure/di/container';

declare module "fastify" {
  interface FastifyInstance {
    jobQueue: JobQueueService;
  }
}

export async function registerJobQueuePlugin(app: FastifyInstance) {
  app.register(jobQueuePlugin);
}

const jobQueuePlugin: FastifyPluginAsync = fp(async (server, _options) => {
  server.log.info("Initializing job queue service...");

  // Resolve from DI (initialized in telegraf plugin)
  const jobQueueService = container.get<JobQueueService>(DI_TOKENS.JobQueue as any);
  await jobQueueService.setupScheduledJobs();

  server.log.info("Job queue service initialized");

  server.decorate("jobQueue", jobQueueService);

  server.addHook("onClose", async () => {
    server.log.info("Shutting down job queue service...");
    await jobQueueService.shutdown();
    server.log.info("Job queue service stopped");
  });
});

export { jobQueuePlugin };
export default jobQueuePlugin;
