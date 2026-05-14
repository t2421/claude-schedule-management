import { NotFoundError } from "../../domain/errors.js";
import type { JobName } from "../../domain/job/JobName.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

export type ApplyJobDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
};

// Re-apply an existing job's scheduler artifacts (regenerate plist + reload).
export function makeApplyJob(deps: ApplyJobDeps) {
  return async (name: JobName): Promise<void> => {
    const job = await deps.jobs.find(name);
    if (!job) throw new NotFoundError(`job not found: ${name.value}`);
    await deps.scheduler.apply(job);
  };
}
