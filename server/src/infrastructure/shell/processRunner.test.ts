import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run } from "./processRunner.js";

describe("run()", () => {
  it("returns code 0, captured stdout, and empty stderr for a successful command", async () => {
    const r = await run("echo", ["hello"]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), "hello");
    assert.equal(r.stderr, "");
  });

  it("returns the non-zero exit code when the command exits with failure", async () => {
    const r = await run("sh", ["-c", "exit 42"]);
    assert.equal(r.code, 42);
  });

  it("captures stderr separately from stdout", async () => {
    const r = await run("sh", ["-c", "printf out; printf err >&2"]);
    assert.equal(r.stdout, "out");
    assert.equal(r.stderr, "err");
  });

  it("returns code -1 and appends the OS error to stderr when the command is not found", async () => {
    const r = await run("__nonexistent_command_xyz__", []);
    assert.equal(r.code, -1);
    assert.ok(r.stderr.length > 0, "stderr should contain the error message");
  });

  it("passes multiple arguments to the child process without shell interpolation", async () => {
    const r = await run("sh", ["-c", 'echo "$1 $2"', "--", "foo", "bar"]);
    assert.equal(r.code, 0);
    assert.equal(r.stdout.trim(), "foo bar");
  });
});
