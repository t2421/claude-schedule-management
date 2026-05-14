import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const here = path.dirname(fileURLToPath(import.meta.url));

// Resolve relative to compiled dist/ or src/ — we go up to the server package
// root, then up once more to the repo root.
export const ROOT = path.resolve(here, "..", "..", "..");

export const JOBS_DIR = path.join(ROOT, "jobs");
export const PLISTS_DIR = path.join(ROOT, "plists");
export const LOGS_DIR = path.join(ROOT, "logs");
export const RUNNER = path.join(ROOT, "bin", "runner.sh");

export const LAUNCH_AGENTS_DIR = path.join(os.homedir(), "Library", "LaunchAgents");

export const LABEL_PREFIX =
  process.env.CLAUDE_SCHEDULE_LABEL_PREFIX ?? "local.claude-schedule.job";

export const SERVICE_LABEL =
  process.env.CLAUDE_SCHEDULE_SERVICE_LABEL ?? "local.claude-schedule.service";

export function labelFor(jobName: string): string {
  return `${LABEL_PREFIX}.${jobName}`;
}

export function generatedPlistPath(jobName: string): string {
  return path.join(PLISTS_DIR, `${labelFor(jobName)}.plist`);
}

export function linkedPlistPath(jobName: string): string {
  return path.join(LAUNCH_AGENTS_DIR, `${labelFor(jobName)}.plist`);
}

export function jobYamlPath(jobName: string): string {
  return path.join(JOBS_DIR, `${jobName}.yaml`);
}

export function jobLogsDir(jobName: string): string {
  return path.join(LOGS_DIR, jobName);
}
