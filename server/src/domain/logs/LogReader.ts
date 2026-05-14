import type { JobName } from "../job/JobName.js";

export type LogFile = {
  file: string;
  size: number;
  mtime: string;
};

export interface LogReader {
  list(jobName: JobName): Promise<LogFile[]>;
  read(jobName: JobName, file: string, tailBytes?: number): Promise<string>;
}
