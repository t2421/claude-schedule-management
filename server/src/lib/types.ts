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

export type Orphan = {
  // Job name extracted from the plist's ProgramArguments[1], when discoverable.
  name: string;
  // Full launchd label.
  label: string;
  // Is the service currently loaded in launchd?
  loaded: boolean;
  inAgentsDir: boolean;
  inLocalPlists: boolean;
};
