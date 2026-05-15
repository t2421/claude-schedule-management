import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeReadLog } from "./ReadLogUseCase.js";
import { JobName } from "../../domain/job/JobName.js";
import type { LogReader } from "../../domain/logs/LogReader.js";

type ReadCall = { name: string; file: string; tailBytes: number | undefined };

function makeLogReader(content: string): LogReader & { calls: ReadCall[] } {
  const calls: ReadCall[] = [];
  return {
    calls,
    list: async () => [],
    read: async (name, file, tailBytes) => {
      calls.push({ name: name.value, file, tailBytes });
      return content;
    },
  };
}

describe("makeReadLog", () => {
  it("returns the log content for the given job name and file", async () => {
    const name = JobName.parse("daily-review");
    const reader = makeLogReader("hello from log");
    const readLog = makeReadLog({ logs: reader });

    const result = await readLog(name, "stdout.log");

    assert.equal(result, "hello from log");
  });

  it("passes tailBytes to the log reader when provided", async () => {
    const name = JobName.parse("daily-review");
    const reader = makeLogReader("tail content");
    const readLog = makeReadLog({ logs: reader });

    await readLog(name, "stdout.log", 512);

    assert.equal(reader.calls.length, 1);
    assert.equal(reader.calls[0].tailBytes, 512);
  });

  it("passes tailBytes as undefined when not provided", async () => {
    const name = JobName.parse("daily-review");
    const reader = makeLogReader("full content");
    const readLog = makeReadLog({ logs: reader });

    await readLog(name, "stdout.log");

    assert.equal(reader.calls.length, 1);
    assert.equal(reader.calls[0].tailBytes, undefined);
  });

  it("forwards the job name and file path to the log reader", async () => {
    const name = JobName.parse("my-job");
    const reader = makeLogReader("");
    const readLog = makeReadLog({ logs: reader });

    await readLog(name, "stderr.log");

    assert.equal(reader.calls[0].name, "my-job");
    assert.equal(reader.calls[0].file, "stderr.log");
  });

  it("propagates errors from the log reader", async () => {
    const name = JobName.parse("broken-job");
    const reader: LogReader = {
      list: async () => [],
      read: async () => {
        throw new Error("file not found");
      },
    };
    const readLog = makeReadLog({ logs: reader });

    await assert.rejects(() => readLog(name, "stdout.log"), /file not found/);
  });
});
