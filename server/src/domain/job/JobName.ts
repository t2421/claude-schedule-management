import { ValidationError } from "../errors.js";

const RE = /^[a-z0-9][a-z0-9-]*$/;

// Value Object: a job name suitable for filenames and launchd labels.
// Immutable; constructed only via JobName.parse.
export class JobName {
  private constructor(public readonly value: string) {}

  static parse(raw: unknown): JobName {
    if (typeof raw !== "string" || !RE.test(raw)) {
      throw new ValidationError(
        "name must be lowercase letters, digits, and dashes (e.g. daily-review)",
      );
    }
    return new JobName(raw);
  }

  toString(): string {
    return this.value;
  }

  equals(other: JobName): boolean {
    return this.value === other.value;
  }
}
