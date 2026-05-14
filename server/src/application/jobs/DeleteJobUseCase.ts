import type { JobName } from "../../domain/job/JobName.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

export type DeleteJobDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
};

export function makeDeleteJob(deps: DeleteJobDeps) {
  return async (name: JobName): Promise<boolean> => {
    await deps.scheduler.unload(name);
    return deps.jobs.delete(name);
  };
}
