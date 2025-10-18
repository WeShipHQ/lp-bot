import fp from "fastify-plugin";
import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { JobQueueService } from "@/infrastructure/jobs/job-queue.service";

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

  const jobQueueService = new JobQueueService({ bot: (server as any).bot });
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
