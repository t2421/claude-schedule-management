import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..", "..");

export const JOBS_DIR = path.join(ROOT, "jobs");
export const PLISTS_DIR = path.join(ROOT, "plists");
export const LOGS_DIR = path.join(ROOT, "logs");
export const RUNNER = path.join(ROOT, "bin", "runner.sh");

export const LAUNCH_AGENTS_DIR = path.join(os.homedir(), "Library", "LaunchAgents");

// Reverse-DNS label prefix for generated job plists.
// Override via env var CLAUDE_SCHEDULE_LABEL_PREFIX, e.g. `com.acme.claude-schedule.job`.
// Default uses the `local.` pseudo-TLD reserved for local use.
export const LABEL_PREFIX =
  process.env.CLAUDE_SCHEDULE_LABEL_PREFIX ?? "local.claude-schedule.job";

// Label for the management web service itself (kept separate from job labels
// so a job named "service" doesn't collide).
export const SERVICE_LABEL =
  process.env.CLAUDE_SCHEDULE_SERVICE_LABEL ?? "local.claude-schedule.service";

export function labelFor(jobName: string): string {
  return `${LABEL_PREFIX}.${jobName}`;
}

export function plistPathFor(jobName: string): string {
  return path.join(PLISTS_DIR, `${labelFor(jobName)}.plist`);
}

export function linkedPlistPathFor(jobName: string): string {
  return path.join(LAUNCH_AGENTS_DIR, `${labelFor(jobName)}.plist`);
}

export function jobYamlPathFor(jobName: string): string {
  return path.join(JOBS_DIR, `${jobName}.yaml`);
}

export function jobLogsDirFor(jobName: string): string {
  return path.join(LOGS_DIR, jobName);
}
