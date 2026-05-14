import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { JOBS_DIR, jobYamlPathFor } from "./paths.js";
import type { Job } from "./types.js";

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function validateJob(input: unknown): Job {
  if (!input || typeof input !== "object") {
    throw new Error("job must be an object");
  }
  const j = input as Record<string, unknown>;

  const name = j.name;
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new Error(
      "name must be lowercase letters, digits, and dashes (e.g. daily-review)",
    );
  }
  const schedule = j.schedule as Record<string, unknown> | undefined;
  if (!schedule || typeof schedule.cron !== "string" || !schedule.cron.trim()) {
    throw new Error("schedule.cron is required");
  }
  if (typeof j.prompt !== "string" || !j.prompt.trim()) {
    throw new Error("prompt is required");
  }

  return {
    name,
    description: typeof j.description === "string" ? j.description : undefined,
    enabled: j.enabled !== false,
    schedule: { cron: schedule.cron.trim() },
    working_directory:
      typeof j.working_directory === "string" ? j.working_directory : undefined,
    prompt: j.prompt,
    claude_args: Array.isArray(j.claude_args)
      ? j.claude_args.filter((x): x is string => typeof x === "string")
      : undefined,
    env:
      j.env && typeof j.env === "object" && !Array.isArray(j.env)
        ? Object.fromEntries(
            Object.entries(j.env as Record<string, unknown>).flatMap(([k, v]) =>
              typeof v === "string" ? [[k, v]] : [],
            ),
          )
        : undefined,
    timeout_seconds:
      typeof j.timeout_seconds === "number" ? j.timeout_seconds : undefined,
  };
}

export async function listJobs(): Promise<Job[]> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const entries = await fs.readdir(JOBS_DIR);
  const yamls = entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const jobs: Job[] = [];
  for (const file of yamls) {
    try {
      const raw = await fs.readFile(path.join(JOBS_DIR, file), "utf8");
      jobs.push(validateJob(YAML.parse(raw)));
    } catch (err) {
      console.error(`failed to load ${file}: ${(err as Error).message}`);
    }
  }
  jobs.sort((a, b) => a.name.localeCompare(b.name));
  return jobs;
}

export async function readJob(name: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobYamlPathFor(name), "utf8");
    return validateJob(YAML.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeJob(job: Job): Promise<void> {
  const validated = validateJob(job);
  await fs.mkdir(JOBS_DIR, { recursive: true });
  const yaml = YAML.stringify(validated, { lineWidth: 0 });
  await fs.writeFile(jobYamlPathFor(validated.name), yaml, "utf8");
}

export async function deleteJob(name: string): Promise<boolean> {
  try {
    await fs.unlink(jobYamlPathFor(name));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
