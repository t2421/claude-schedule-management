import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { FileLogReader } from "./FileLogReader.js";
import { JobName } from "../../domain/job/JobName.js";
import { ValidationError } from "../../domain/errors.js";
import { LOGS_DIR } from "../../config/paths.js";

// Tests against the real LOGS_DIR layout (logs/<jobName>/*). We pick a unique
// fixture name so we never touch a user's actual logs.
const FIXTURE_NAME = "filelogreader-test-fixture";
const fixtureDir = path.join(LOGS_DIR, FIXTURE_NAME);

describe("FileLogReader.read", () => {
  const reader = new FileLogReader();
  const name = JobName.parse(FIXTURE_NAME);

  before(async () => {
    await fs.mkdir(fixtureDir, { recursive: true });
    await fs.writeFile(
      path.join(fixtureDir, "sample.log"),
      "0123456789ABCDEFGHIJ",
      "utf8",
    );
  });

  after(async () => {
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  it("reads the full file when tailBytes is undefined", async () => {
    const out = await reader.read(name, "sample.log");
    assert.equal(out, "0123456789ABCDEFGHIJ");
  });

  it("returns only the last N bytes when tailBytes is a positive integer", async () => {
    const out = await reader.read(name, "sample.log", 5);
    assert.equal(out, "FGHIJ");
  });

  it("rejects NaN tailBytes with ValidationError instead of crashing", async () => {
    // Regression: Number("abc") from a malformed ?tail query previously
    // propagated to Buffer.alloc(NaN), which throws RangeError → HTTP 500.
    // Validate at the I/O boundary so the HTTP layer maps it to 400.
    await assert.rejects(
      () => reader.read(name, "sample.log", Number.NaN),
      ValidationError,
    );
  });

  it("rejects Infinity tailBytes with ValidationError", async () => {
    await assert.rejects(
      () => reader.read(name, "sample.log", Number.POSITIVE_INFINITY),
      ValidationError,
    );
    await assert.rejects(
      () => reader.read(name, "sample.log", Number.NEGATIVE_INFINITY),
      ValidationError,
    );
  });

  it("rejects negative, zero, and non-integer tailBytes with ValidationError", async () => {
    await assert.rejects(
      () => reader.read(name, "sample.log", -1),
      ValidationError,
    );
    await assert.rejects(
      () => reader.read(name, "sample.log", 0),
      ValidationError,
    );
    await assert.rejects(
      () => reader.read(name, "sample.log", 1.5),
      ValidationError,
    );
  });

  it("rejects filenames containing '/' or '..' (path traversal)", async () => {
    await assert.rejects(
      () => reader.read(name, "../etc/passwd"),
      ValidationError,
    );
    await assert.rejects(
      () => reader.read(name, "subdir/file.log"),
      ValidationError,
    );
  });
});
