import { ValidationError } from "../errors.js";

// Value Object: a 5-field cron expression. We only validate field count and
// non-emptiness here. Field-level validation (ranges, syntax) is the
// responsibility of the infrastructure layer that translates cron to
// launchd's StartCalendarInterval, since the truth of "valid cron" depends on
// what the backend can actually execute.
export class CronSchedule {
  private constructor(public readonly expression: string) {}

  static parse(raw: unknown): CronSchedule {
    if (typeof raw !== "string" || !raw.trim()) {
      throw new ValidationError("schedule.cron is required");
    }
    const trimmed = raw.trim();
    const fields = trimmed.split(/\s+/);
    if (fields.length !== 5) {
      throw new ValidationError(
        `cron must have 5 fields (minute hour dom month dow); got: "${trimmed}"`,
      );
    }
    return new CronSchedule(trimmed);
  }

  toString(): string {
    return this.expression;
  }
}
