import { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

export type SaveJobDeps = {
  jobs: JobRepository;
  scheduler: Scheduler;
};

// Create or update a job from a plain (HTTP body or YAML-shaped) payload.
// Persists to the repository, then applies to the scheduler.
export function makeSaveJob(deps: SaveJobDeps) {
  return async (payload: unknown): Promise<Job> => {
    const job = Job.fromPlain(payload);
    await deps.jobs.save(job);
    await deps.scheduler.apply(job);
    return job;
  };
}
