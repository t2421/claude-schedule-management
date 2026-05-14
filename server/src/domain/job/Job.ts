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

// Entity. Owns invariants for a single job. Constructed only via Job.create.
export class Job {
  private constructor(private readonly props: JobProps) {}

  static create(props: JobProps): Job {
    if (!props.prompt.trim()) {
      throw new ValidationError("prompt is required");
    }
    if (props.timeoutSeconds !== undefined && props.timeoutSeconds < 0) {
      throw new ValidationError("timeout_seconds must be >= 0");
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
