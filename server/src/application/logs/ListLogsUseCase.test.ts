import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeListLogs } from "./ListLogsUseCase.js";
import { JobName } from "../../domain/job/JobName.js";
import type { LogFile, LogReader } from "../../domain/logs/LogReader.js";

function makeLogReader(files: LogFile[], readFn?: () => Promise<string>): LogReader {
  return {
    list: async () => files,
    read: readFn ?? (async () => ""),
  };
}

describe("makeListLogs", () => {
  it("returns the log files for the given job name", async () => {
    const name = JobName.parse("daily-review");
    const files: LogFile[] = [
      { file: "stdout.log", size: 1024, mtime: "2026-05-15T00:00:00.000Z" },
      { file: "stderr.log", size: 256, mtime: "2026-05-15T00:01:00.000Z" },
    ];
    const listLogs = makeListLogs({ logs: makeLogReader(files) });

    const result = await listLogs(name);

    assert.deepEqual(result, files);
  });

  it("returns an empty array when there are no log files", async () => {
    const name = JobName.parse("quiet-job");
    const listLogs = makeListLogs({ logs: makeLogReader([]) });

    const result = await listLogs(name);

    assert.deepEqual(result, []);
  });

  it("propagates errors from the log reader", async () => {
    const name = JobName.parse("broken-job");
    const reader: LogReader = {
      list: async () => {
        throw new Error("disk read failed");
      },
      read: async () => "",
    };
    const listLogs = makeListLogs({ logs: reader });

    await assert.rejects(() => listLogs(name), /disk read failed/);
  });
});
