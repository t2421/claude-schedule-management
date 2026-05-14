import type { Job } from "../job/Job.js";
import type { JobName } from "../job/JobName.js";

export type JobStatus = {
  loaded: boolean;
  pid?: number;
  lastExitStatus?: number;
};

// OS-level scheduler abstraction. The launchd implementation lives in
// infrastructure/scheduler/.
export interface Scheduler {
  // Materialize a job in the scheduler (create / replace artifacts and load it
  // if enabled).
  apply(job: Job): Promise<void>;

  // Remove a job from the scheduler and delete its artifacts.
  unload(name: JobName): Promise<void>;

  // Trigger a job to run immediately.
  kickstart(name: JobName): Promise<void>;

  // Statuses for jobs currently registered under our label prefix, keyed by
  // job name.
  statuses(): Promise<Map<string, JobStatus>>;
}
