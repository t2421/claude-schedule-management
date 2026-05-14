import type { Job } from "./Job.js";
import type { JobName } from "./JobName.js";

// Persistence-agnostic interface for storing jobs. Implementations live in
// infrastructure/persistence/.
export interface JobRepository {
  list(): Promise<Job[]>;
  find(name: JobName): Promise<Job | null>;
  save(job: Job): Promise<void>;
  delete(name: JobName): Promise<boolean>;
}
