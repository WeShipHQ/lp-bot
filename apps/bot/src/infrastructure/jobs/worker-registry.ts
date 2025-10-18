import { Job } from "bullmq";
import { KnownJobNames, KnownJobDataMap } from "./job-definitions";

export interface IWorker<T = any> {
  process(job: Job<T>): Promise<any>;
}

export class WorkerRegistry {
  private readonly workers = new Map<KnownJobNames, IWorker<any>>();

  register<N extends KnownJobNames>(name: N, workerInstance: IWorker<KnownJobDataMap[N]>): void {
    this.workers.set(name, workerInstance as IWorker<any>);
  }

  get<N extends KnownJobNames>(name: N): IWorker<KnownJobDataMap[N]> | undefined {
    return this.workers.get(name) as IWorker<KnownJobDataMap[N]> | undefined;
  }

  getAll(): Array<{ name: KnownJobNames; worker: IWorker<any> }> {
    return Array.from(this.workers.entries()).map(([name, worker]) => ({ name, worker }));
  }
}
