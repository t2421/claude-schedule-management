import { ValidationError } from "../errors.js";
import { CronSchedule } from "./CronSchedule.js";
import { JobName } from "./JobName.js";

export type JobProps = {
  name: JobName;
  description?: string;
  enabled: boolean;
  schedule: CronSchedule;
  workingDirectory?: string;
  prompt: string;
  claudeArgs: string[];
  env?: Record<string, string>;
  timeoutSeconds?: number;
};

// POSIX env variable name. Conservative — runner.sh parses env entries
// line-by-line, so a name with newlines or = would corrupt the loop.
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Entity. Owns invariants for a single job. Constructed only via Job.create.
export class Job {
  private constructor(private readonly props: JobProps) {}

  static create(props: JobProps): Job {
    if (!props.prompt.trim()) {
      throw new ValidationError("prompt is required");
    }
    // PROMPT flows YAML → yq → bash argv → claude CLI. Bash strings are
    // NUL-terminated, so a NUL byte would silently truncate the prompt.
    if (props.prompt.includes("\0")) {
      throw new ValidationError("prompt must not contain NUL bytes");
    }
    if (props.timeoutSeconds !== undefined && props.timeoutSeconds < 0) {
      throw new ValidationError("timeout_seconds must be >= 0");
    }
    if (props.workingDirectory !== undefined) {
      const wd = props.workingDirectory;
      if (wd !== "" && !wd.startsWith("/")) {
        throw new ValidationError("working_directory must be an absolute path");
      }
      // Reject `..` components to prevent the runner from cd-ing into a
      // parent of an intended directory — the user must spell out the full
      // path they want.
      if (wd.split("/").includes("..")) {
        throw new ValidationError("working_directory must not contain '..'");
      }
    }
    if (props.env) {
      for (const [k, v] of Object.entries(props.env)) {
        if (!ENV_KEY_RE.test(k)) {
          throw new ValidationError(
            `env var name "${k}" is invalid (must match ${ENV_KEY_RE})`,
          );
        }
        if (v.includes("\n") || v.includes("\0")) {
          throw new ValidationError(
            `env var "${k}" value contains a newline or NUL`,
          );
        }
      }
    }
    // claude_args go through spawn argv, so there is no shell injection
    // surface — but newlines / null bytes can confuse downstream tooling and
    // are never useful flag values.
    for (const arg of props.claudeArgs) {
      if (arg.includes("\n") || arg.includes("\0")) {
        throw new ValidationError("claude_args must not contain newlines or NUL");
      }
    }
    return new Job(props);
  }

  get name(): JobName { return this.props.name; }
  get description(): string | undefined { return this.props.description; }
  get enabled(): boolean { return this.props.enabled; }
  get schedule(): CronSchedule { return this.props.schedule; }
  get workingDirectory(): string | undefined { return this.props.workingDirectory; }
  get prompt(): string { return this.props.prompt; }
  get claudeArgs(): string[] { return [...this.props.claudeArgs]; }
  get env(): Record<string, string> | undefined {
    return this.props.env ? { ...this.props.env } : undefined;
  }
  get timeoutSeconds(): number | undefined { return this.props.timeoutSeconds; }

  // Snake-cased plain object for serialization (YAML / HTTP body).
  toPlain() {
    return {
      name: this.props.name.value,
      description: this.props.description,
      enabled: this.props.enabled,
      schedule: { cron: this.props.schedule.expression },
      working_directory: this.props.workingDirectory,
      prompt: this.props.prompt,
      claude_args: [...this.props.claudeArgs],
      env: this.props.env ? { ...this.props.env } : undefined,
      timeout_seconds: this.props.timeoutSeconds,
    };
  }

  // Hydrate from a plain object (YAML parse / HTTP body).
  // The factory pattern keeps construction validation centralized.
  static fromPlain(input: unknown): Job {
    if (!input || typeof input !== "object") {
      throw new ValidationError("job must be an object");
    }
    const j = input as Record<string, unknown>;
    const schedule = j.schedule as Record<string, unknown> | undefined;
    const cronRaw = schedule?.cron;

    return Job.create({
      name: JobName.parse(j.name),
      description:
        typeof j.description === "string" ? j.description : undefined,
      enabled: j.enabled !== false,
      schedule: CronSchedule.parse(cronRaw),
      workingDirectory:
        typeof j.working_directory === "string" ? j.working_directory : undefined,
      prompt: typeof j.prompt === "string" ? j.prompt : "",
      claudeArgs: Array.isArray(j.claude_args)
        ? j.claude_args.filter((x): x is string => typeof x === "string")
        : ["-p"],
      env:
        j.env && typeof j.env === "object" && !Array.isArray(j.env)
          ? Object.fromEntries(
              Object.entries(j.env as Record<string, unknown>).flatMap(
                ([k, v]) => (typeof v === "string" ? [[k, v]] : []),
              ),
            )
          : undefined,
      timeoutSeconds:
        typeof j.timeout_seconds === "number" ? j.timeout_seconds : undefined,
    });
  }
}
