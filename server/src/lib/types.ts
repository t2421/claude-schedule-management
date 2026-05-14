export type Job = {
  name: string;
  description?: string;
  enabled: boolean;
  schedule: { cron: string };
  working_directory?: string;
  prompt: string;
  claude_args?: string[];
  env?: Record<string, string>;
  timeout_seconds?: number;
};

export type JobStatus = {
  name: string;
  loaded: boolean;
  pid?: number;
  lastExitStatus?: number;
};

export type RunRecord = {
  jobName: string;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  logFile: string;
};
