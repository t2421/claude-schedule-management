import type { Job } from "../../domain/job/Job.js";
import type { JobStatus } from "../../domain/scheduler/Scheduler.js";

// DTO conversion lives in the HTTP layer so the domain model isn't shaped by
// network concerns.
export function jobToDto(job: Job) {
  return job.toPlain();
}

export function jobWithStatusToDto(job: Job, status: JobStatus) {
  return {
    ...job.toPlain(),
    status: { name: job.name.value, ...status },
  };
}
