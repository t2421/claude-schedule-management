import { NotFoundError } from "../../domain/errors.js";
import type { Job } from "../../domain/job/Job.js";
import type { JobName } from "../../domain/job/JobName.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { JobStatus, Scheduler } from "../../domain/scheduler/Scheduler.js";

export type GetJobResult = { job: Job; status: JobStatus };

export type GetJobDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
};

export function makeGetJob(deps: GetJobDeps) {
  return async (name: JobName): Promise<GetJobResult> => {
    const job = await deps.jobs.find(name);
    if (!job) throw new NotFoundError(`job not found: ${name.value}`);
    const statuses = await deps.scheduler.statuses();
    return {
      job,
      status: statuses.get(name.value) ?? { loaded: false },
    };
  };
}
