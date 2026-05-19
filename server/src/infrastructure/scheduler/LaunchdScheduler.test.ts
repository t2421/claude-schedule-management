import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LaunchdScheduler } from "./LaunchdScheduler.js";
import { SchedulerError } from "../../domain/errors.js";
import { JobName } from "../../domain/job/JobName.js";
import { LABEL_PREFIX } from "../../config/paths.js";
import type { RunResult } from "../shell/processRunner.js";
import type { PlistBuilder } from "./PlistBuilder.js";

const stubPlist = { build: () => "" } as unknown as PlistBuilder;

function makeRunner(result: RunResult) {
  return (_cmd: string, _args: string[]) => Promise.resolve(result);
}

function launchctlList(body: string): RunResult {
  return { code: 0, stdout: `PID\tStatus\tLabel\n${body}`, stderr: "" };
}

function label(jobName: string): string {
  return `${LABEL_PREFIX}.${jobName}`;
}

describe("LaunchdScheduler.statuses", () => {
  it("returns empty map when launchctl exits non-zero", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 1, stdout: "", stderr: "error" }),
    );
    assert.deepEqual(await sched.statuses(), new Map());
  });

  it("returns empty map when stdout has no matching labels", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner(launchctlList("- - com.apple.something\n- - com.apple.other")),
    );
    assert.deepEqual(await sched.statuses(), new Map());
  });

  it("parses a running job with pid and no recorded exit status", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner(launchctlList(`1234\t-\t${label("daily-review")}`)),
    );
    const result = await sched.statuses();
    assert.deepEqual(result.get("daily-review"), {
      loaded: true,
      pid: 1234,
      lastExitStatus: undefined,
    });
  });

  it("parses a stopped job with last exit status and no pid", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner(launchctlList(`-\t0\t${label("daily-review")}`)),
    );
    const result = await sched.statuses();
    assert.deepEqual(result.get("daily-review"), {
      loaded: true,
      pid: undefined,
      lastExitStatus: 0,
    });
  });

  it("parses a job where both pid and exit status are dashes", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner(launchctlList(`-\t-\t${label("my-job")}`)),
    );
    const result = await sched.statuses();
    assert.deepEqual(result.get("my-job"), {
      loaded: true,
      pid: undefined,
      lastExitStatus: undefined,
    });
  });

  it("returns entries for all matching labels and ignores others", async () => {
    const body = [
      `1234\t-\t${label("job-a")}`,
      `-\t0\t${label("job-b")}`,
      `- - com.apple.nope`,
    ].join("\n");
    const sched = new LaunchdScheduler(stubPlist, makeRunner(launchctlList(body)));
    const result = await sched.statuses();
    assert.equal(result.size, 2);
    assert.ok(result.has("job-a"));
    assert.ok(result.has("job-b"));
  });

  it("skips blank lines without throwing", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner(launchctlList(`\n-\t0\t${label("my-job")}\n\n`)),
    );
    const result = await sched.statuses();
    assert.equal(result.size, 1);
    assert.ok(result.has("my-job"));
  });
});

describe("LaunchdScheduler.kickstart", () => {
  it("resolves without throwing when launchctl succeeds", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 0, stdout: "", stderr: "" }),
    );
    await assert.doesNotReject(() => sched.kickstart(JobName.parse("daily-review")));
  });

  it("throws SchedulerError with stderr message on non-zero exit", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 1, stdout: "", stderr: "No such process" }),
    );
    await assert.rejects(
      () => sched.kickstart(JobName.parse("daily-review")),
      (err: unknown) => {
        assert.ok(err instanceof SchedulerError);
        assert.match(err.message, /No such process/);
        return true;
      },
    );
  });

  it("throws SchedulerError with fallback message when stderr is empty", async () => {
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 1, stdout: "", stderr: "" }),
    );
    await assert.rejects(
      () => sched.kickstart(JobName.parse("daily-review")),
      (err: unknown) => {
        assert.ok(err instanceof SchedulerError);
        assert.match(err.message, /kickstart failed/);
        return true;
      },
    );
  });
});
