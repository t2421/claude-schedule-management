import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Job } from "./Job.js";
import { ValidationError } from "../errors.js";

const base = {
  name: "daily-review",
  schedule: { cron: "0 9 * * *" },
  prompt: "do the thing",
  enabled: true,
  working_directory: "/Users/x/proj",
};

describe("Job.fromPlain", () => {
  it("rejects non-object and falsy inputs", () => {
    assert.throws(() => Job.fromPlain(null), ValidationError);
    assert.throws(() => Job.fromPlain(undefined), ValidationError);
    assert.throws(() => Job.fromPlain("a string"), ValidationError);
    assert.throws(() => Job.fromPlain(42), ValidationError);
  });

  it("accepts a minimal valid payload", () => {
    const j = Job.fromPlain(base);
    assert.equal(j.name.value, "daily-review");
    assert.equal(j.schedule.expression, "0 9 * * *");
    assert.deepEqual(j.claudeArgs, ["-p"]);
  });

  it("preserves description when provided as a string", () => {
    const j = Job.fromPlain({ ...base, description: "runs the nightly audit" });
    assert.equal(j.description, "runs the nightly audit");
  });

  it("returns undefined for description when absent or non-string", () => {
    assert.equal(Job.fromPlain({ ...base }).description, undefined);
    assert.equal(Job.fromPlain({ ...base, description: 99 }).description, undefined);
  });

  it("defaults enabled to true when the field is absent", () => {
    const { enabled: _e, ...withoutEnabled } = base;
    assert.equal(Job.fromPlain(withoutEnabled).enabled, true);
  });

  it("treats only strict false as disabled (non-false values default to enabled)", () => {
    assert.equal(Job.fromPlain({ ...base, enabled: null }).enabled, true);
    assert.equal(Job.fromPlain({ ...base, enabled: 0 }).enabled, true);
    assert.equal(Job.fromPlain({ ...base, enabled: "" }).enabled, true);
    assert.equal(Job.fromPlain({ ...base, enabled: false }).enabled, false);
  });

  it("preserves timeout_seconds when provided as a number", () => {
    const j = Job.fromPlain({ ...base, timeout_seconds: 300 });
    assert.equal(j.timeoutSeconds, 300);
  });

  it("returns undefined for timeout_seconds when absent or non-number", () => {
    assert.equal(Job.fromPlain({ ...base }).timeoutSeconds, undefined);
    assert.equal(
      Job.fromPlain({ ...base, timeout_seconds: "300" }).timeoutSeconds,
      undefined,
    );
  });

  it("preserves a valid env record", () => {
    const j = Job.fromPlain({ ...base, env: { FOO: "bar", DEBUG: "1" } });
    assert.deepEqual(j.env, { FOO: "bar", DEBUG: "1" });
  });

  it("returns undefined for env when absent", () => {
    assert.equal(Job.fromPlain({ ...base }).env, undefined);
  });

  it("rejects empty prompt", () => {
    assert.throws(() => Job.fromPlain({ ...base, prompt: "  " }), ValidationError);
  });

  it("rejects prompt with NUL byte", () => {
    // PROMPT is passed as a single argv to the claude CLI via bash. Bash
    // strings are NUL-terminated, so a NUL would silently truncate the
    // prompt — refuse it at the domain boundary.
    assert.throws(
      () => Job.fromPlain({ ...base, prompt: "hello\0world" }),
      ValidationError,
    );
  });

  it("rejects missing working_directory", () => {
    const { working_directory: _wd, ...withoutWd } = base;
    assert.throws(() => Job.fromPlain(withoutWd), ValidationError);
  });

  it("rejects empty working_directory", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, working_directory: "" }),
      ValidationError,
    );
    assert.throws(
      () => Job.fromPlain({ ...base, working_directory: "   " }),
      ValidationError,
    );
  });

  it("rejects relative working_directory", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, working_directory: "relative/path" }),
      ValidationError,
    );
  });

  it("rejects working_directory with '..'", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, working_directory: "/foo/../bar" }),
      ValidationError,
    );
  });

  it("accepts absolute working_directory", () => {
    const j = Job.fromPlain({ ...base, working_directory: "/Users/x/proj" });
    assert.equal(j.workingDirectory, "/Users/x/proj");
  });

  it("rejects invalid env var name", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, env: { "with space": "v" } }),
      ValidationError,
    );
    assert.throws(
      () => Job.fromPlain({ ...base, env: { "lower=bad": "v" } }),
      ValidationError,
    );
  });

  it("rejects env value with newline", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, env: { FOO: "line1\nline2" } }),
      ValidationError,
    );
  });

  it("rejects env value with NUL", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, env: { FOO: "a\0b" } }),
      ValidationError,
    );
  });

  it("rejects claude_args with newline or NUL", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, claude_args: ["-p", "x\ny"] }),
      ValidationError,
    );
    assert.throws(
      () => Job.fromPlain({ ...base, claude_args: ["x\x00y"] }),
      ValidationError,
    );
  });

  it("accepts claude_args with normal flags", () => {
    const j = Job.fromPlain({
      ...base,
      claude_args: ["-p", "--dangerously-skip-permissions"],
    });
    assert.deepEqual(j.claudeArgs, ["-p", "--dangerously-skip-permissions"]);
  });

  it("rejects negative timeout", () => {
    assert.throws(
      () => Job.fromPlain({ ...base, timeout_seconds: -1 }),
      ValidationError,
    );
  });
});

describe("Job.toPlain()", () => {
  it("serializes all fields in snake_case", () => {
    const j = Job.fromPlain({
      ...base,
      description: "nightly audit",
      claude_args: ["-p", "--no-tools"],
      env: { API_KEY: "secret" },
      timeout_seconds: 120,
    });
    const plain = j.toPlain();
    assert.equal(plain.name, "daily-review");
    assert.equal(plain.description, "nightly audit");
    assert.equal(plain.enabled, true);
    assert.deepEqual(plain.schedule, { cron: "0 9 * * *" });
    assert.equal(plain.working_directory, "/Users/x/proj");
    assert.equal(plain.prompt, "do the thing");
    assert.deepEqual(plain.claude_args, ["-p", "--no-tools"]);
    assert.deepEqual(plain.env, { API_KEY: "secret" });
    assert.equal(plain.timeout_seconds, 120);
  });

  it("omits optional fields when absent", () => {
    const plain = Job.fromPlain(base).toPlain();
    assert.equal(plain.description, undefined);
    assert.equal(plain.env, undefined);
    assert.equal(plain.timeout_seconds, undefined);
  });

  it("round-trips through fromPlain", () => {
    const original = Job.fromPlain({
      ...base,
      description: "daily audit",
      claude_args: ["-p"],
      env: { DEBUG: "true" },
      timeout_seconds: 60,
    });
    const rt = Job.fromPlain(original.toPlain());
    assert.equal(rt.name.value, original.name.value);
    assert.equal(rt.description, original.description);
    assert.equal(rt.enabled, original.enabled);
    assert.equal(rt.schedule.expression, original.schedule.expression);
    assert.equal(rt.workingDirectory, original.workingDirectory);
    assert.equal(rt.prompt, original.prompt);
    assert.deepEqual(rt.claudeArgs, original.claudeArgs);
    assert.deepEqual(rt.env, original.env);
    assert.equal(rt.timeoutSeconds, original.timeoutSeconds);
  });

  it("serializes enabled: false", () => {
    const plain = Job.fromPlain({ ...base, enabled: false }).toPlain();
    assert.equal(plain.enabled, false);
  });

  it("returns independent copies of arrays and objects", () => {
    const j = Job.fromPlain({ ...base, claude_args: ["-p"], env: { X: "1" } });
    const plain = j.toPlain();
    (plain.claude_args as string[]).push("--extra");
    (plain.env as Record<string, string>)["Y"] = "2";
    assert.deepEqual(j.claudeArgs, ["-p"]);
    assert.deepEqual(j.env, { X: "1" });
  });
});
