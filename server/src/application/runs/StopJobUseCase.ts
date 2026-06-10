import { NotFoundError } from "../../domain/errors.js";
import type { JobName } from "../../domain/job/JobName.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

export type StopDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
};

export function makeStopJob(deps: StopDeps) {
  return async (name: JobName): Promise<void> => {
    const job = await deps.jobs.find(name);
    if (!job) throw new NotFoundError(`job not found: ${name.value}`);
    await deps.scheduler.stop(name);
  };
}
