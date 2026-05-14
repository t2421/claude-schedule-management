import type { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type {
  JobStatus,
  Scheduler,
} from "../../domain/scheduler/Scheduler.js";
import type { Orphan } from "../../domain/scheduler/Orphan.js";
import type { OrphanScanner } from "../../domain/scheduler/OrphanScanner.js";

export type ListJobsResult = {
  jobs: { job: Job; status: JobStatus }[];
  orphans: Orphan[];
};

export type ListJobsDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
  orphans: OrphanScanner;
};

export function makeListJobs(deps: ListJobsDeps) {
  return async (): Promise<ListJobsResult> => {
    const jobs = await deps.jobs.list();
    const statuses = await deps.scheduler.statuses();
    const known = new Set(jobs.map((j) => j.name.value));
    const orphans = await deps.orphans.scan(known);
    return {
      jobs: jobs.map((j) => ({
        job: j,
        status: statuses.get(j.name.value) ?? { loaded: false },
      })),
      orphans,
    };
  };
}
