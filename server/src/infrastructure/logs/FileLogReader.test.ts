import { describe, it, before, after, beforeEach } from "node:test";
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

  it("returns the full file when tailBytes exceeds the file size", async () => {
    // LogViewer requests up to 200 000 bytes; most log files are smaller.
    // Math.max(0, size - tail) must clamp to 0 so the entire file is returned.
    const out = await reader.read(name, "sample.log", 200_000);
    assert.equal(out, "0123456789ABCDEFGHIJ");
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

describe("FileLogReader.list", () => {
  const reader = new FileLogReader();
  const LIST_NAME = "filelogreader-list-fixture";
  const listDir = path.join(LOGS_DIR, LIST_NAME);
  const listJobName = JobName.parse(LIST_NAME);

  async function cleanDir() {
    await fs.rm(listDir, { recursive: true, force: true });
  }

  beforeEach(cleanDir);
  after(cleanDir);

  it("returns empty array when log directory does not exist", async () => {
    const result = await reader.list(listJobName);
    assert.deepEqual(result, []);
  });

  it("returns empty array when directory contains no .log files", async () => {
    await fs.mkdir(listDir, { recursive: true });
    await fs.writeFile(path.join(listDir, "output.txt"), "nope");
    const result = await reader.list(listJobName);
    assert.deepEqual(result, []);
  });

  it("returns file, size, and ISO-8601 mtime for each .log file", async () => {
    await fs.mkdir(listDir, { recursive: true });
    await fs.writeFile(path.join(listDir, "run.log"), "hello");
    const result = await reader.list(listJobName);
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "run.log");
    assert.equal(result[0].size, 5);
    assert.match(result[0].mtime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("sorts newest file first (descending mtime)", async () => {
    await fs.mkdir(listDir, { recursive: true });
    const olderPath = path.join(listDir, "a-older.log");
    const newerPath = path.join(listDir, "b-newer.log");
    await fs.writeFile(olderPath, "old");
    await fs.writeFile(newerPath, "new");
    const nowSecs = Date.now() / 1000;
    await fs.utimes(olderPath, nowSecs, nowSecs - 60);
    await fs.utimes(newerPath, nowSecs, nowSecs);
    const result = await reader.list(listJobName);
    assert.equal(result.length, 2);
    assert.equal(result[0].file, "b-newer.log");
    assert.equal(result[1].file, "a-older.log");
  });

  it("re-throws errors other than ENOENT", async () => {
    // Place a regular file at the path readdir expects to be a directory.
    // readdir(file) yields ENOTDIR, which must propagate rather than be swallowed.
    await fs.writeFile(listDir, "i am a file");
    await assert.rejects(() => reader.list(listJobName), { code: "ENOTDIR" });
  });
});
