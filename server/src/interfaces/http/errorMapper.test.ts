import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import type { Context } from "hono";
import { handleError } from "./errorMapper.js";
import {
  NotFoundError,
  PickerCancelledError,
  SchedulerError,
  ValidationError,
} from "../../domain/errors.js";

// Hono's Context surface used by errorMapper is just `c.json(body, status?)`.
// A minimal fake that captures the call is enough — and avoids spinning up a
// full HTTP server for what is a pure mapping function.
interface CapturedResponse {
  body: unknown;
  status: number;
}

function makeFakeContext(): Context & { captured: CapturedResponse | null } {
  const ctx = {
    captured: null as CapturedResponse | null,
    json(body: unknown, status?: number) {
      // `c.json(body)` (no status) is treated as 200 by Hono.
      this.captured = { body, status: status ?? 200 };
      return this.captured;
    },
  };
  return ctx as unknown as Context & { captured: CapturedResponse | null };
}

describe("handleError", () => {
  it("maps ValidationError to 400 with the error message", () => {
    const c = makeFakeContext();
    handleError(c, new ValidationError("name is required"));
    assert.deepEqual(c.captured, {
      body: { error: "name is required" },
      status: 400,
    });
  });

  it("maps NotFoundError to 404 with the error message", () => {
    const c = makeFakeContext();
    handleError(c, new NotFoundError("job 'foo' not found"));
    assert.deepEqual(c.captured, {
      body: { error: "job 'foo' not found" },
      status: 404,
    });
  });

  it("maps SchedulerError to 500 with the error message", () => {
    const c = makeFakeContext();
    handleError(c, new SchedulerError("launchctl bootstrap failed"));
    assert.deepEqual(c.captured, {
      body: { ok: false, error: "launchctl bootstrap failed" },
      status: 500,
    });
  });

  it("maps PickerCancelledError to 200 ok:false (user-initiated cancel, not an error)", () => {
    // The folder picker is launched by the user from the UI. Cancelling it is
    // a normal flow, not a server failure, so the route returns 200 with a
    // sentinel payload instead of a 4xx/5xx status.
    const c = makeFakeContext();
    handleError(c, new PickerCancelledError());
    assert.deepEqual(c.captured, {
      body: { ok: false, error: "cancelled" },
      status: 200,
    });
  });

  it("maps unknown Error to 500 with the error message", () => {
    const c = makeFakeContext();
    handleError(c, new Error("kaboom"));
    assert.deepEqual(c.captured, {
      body: { error: "kaboom" },
      status: 500,
    });
  });

  it("maps non-Error throwables to 500 'unknown error'", () => {
    // Anything not extending Error (a thrown string, number, plain object)
    // loses its details — the fallback message must not depend on the value's
    // shape, which could itself be sensitive.
    const c = makeFakeContext();
    handleError(c, "raw string");
    assert.deepEqual(c.captured, {
      body: { error: "unknown error" },
      status: 500,
    });
  });

  it("sanitizes the home directory out of ValidationError messages", () => {
    // Filesystem paths from server-side errors can disclose the user account
    // name. Replace $HOME with "~" before returning to the client.
    const home = os.homedir();
    if (!home) {
      // Test relies on $HOME being set; skip otherwise.
      return;
    }
    const c = makeFakeContext();
    handleError(
      c,
      new ValidationError(`working_directory '${home}/projects/secret' is invalid`),
    );
    assert.deepEqual(c.captured, {
      body: { error: "working_directory '~/projects/secret' is invalid" },
      status: 400,
    });
  });

  it("sanitizes the home directory out of NotFoundError messages", () => {
    const home = os.homedir();
    if (!home) return;
    const c = makeFakeContext();
    handleError(c, new NotFoundError(`${home}/jobs/foo.yaml not found`));
    assert.deepEqual(c.captured, {
      body: { error: "~/jobs/foo.yaml not found" },
      status: 404,
    });
  });

  it("sanitizes the home directory out of SchedulerError messages", () => {
    const home = os.homedir();
    if (!home) return;
    const c = makeFakeContext();
    handleError(c, new SchedulerError(`failed to write ${home}/Library/x.plist`));
    assert.deepEqual(c.captured, {
      body: { ok: false, error: "failed to write ~/Library/x.plist" },
      status: 500,
    });
  });

  it("sanitizes the home directory out of generic Error messages", () => {
    const home = os.homedir();
    if (!home) return;
    const c = makeFakeContext();
    handleError(c, new Error(`stat ${home}/x: ENOENT`));
    assert.deepEqual(c.captured, {
      body: { error: "stat ~/x: ENOENT" },
      status: 500,
    });
  });

  it("replaces every occurrence of the home directory, not just the first", () => {
    // Some errors mention the same path twice (e.g. source + destination).
    // Sanitization must replace all occurrences so partial leakage cannot
    // happen by accident.
    const home = os.homedir();
    if (!home) return;
    const c = makeFakeContext();
    handleError(c, new ValidationError(`copy ${home}/a -> ${home}/b failed`));
    assert.deepEqual(c.captured, {
      body: { error: "copy ~/a -> ~/b failed" },
      status: 400,
    });
  });
});
