import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LaunchdScheduler } from "./LaunchdScheduler.js";
import type { FsOps } from "./LaunchdScheduler.js";
import { SchedulerError } from "../../domain/errors.js";
import { Job } from "../../domain/job/Job.js";
import { JobName } from "../../domain/job/JobName.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  generatedPlistPath,
  jobLogsDir,
  linkedPlistPath,
} from "../../config/paths.js";
import type { RunResult } from "../shell/processRunner.js";
import type { PlistBuilder } from "./PlistBuilder.js";

const PLIST_CONTENT = "<plist>stub</plist>";
const stubPlist = { build: () => PLIST_CONTENT } as unknown as PlistBuilder;

type FsCall =
  | { op: "mkdir"; path: string }
  | { op: "writeFile"; path: string; content: string }
  | { op: "unlink"; path: string }
  | { op: "symlink"; target: string; path: string };

function makeFsOps(unlinkErrors: Record<string, NodeJS.ErrnoException> = {}): {
  fsOps: FsOps;
  calls: FsCall[];
} {
  const calls: FsCall[] = [];
  return {
    calls,
    fsOps: {
      async mkdir(path: string) {
        calls.push({ op: "mkdir", path });
      },
      async writeFile(path: string, content: string) {
        calls.push({ op: "writeFile", path, content });
      },
      async unlink(path: string) {
        const err = unlinkErrors[path];
        if (err) throw err;
        calls.push({ op: "unlink", path });
      },
      async symlink(target: string, path: string) {
        calls.push({ op: "symlink", target, path });
      },
    },
  };
}

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
  });
}

function eperm(): NodeJS.ErrnoException {
  return Object.assign(new Error("EPERM: operation not permitted"), {
    code: "EPERM",
  });
}

function makeJob(opts: { enabled?: boolean } = {}): Job {
  return Job.fromPlain({
    name: "test-job",
    schedule: { cron: "0 9 * * *" },
    prompt: "do the thing",
    enabled: opts.enabled ?? true,
    working_directory: "/tmp",
  });
}

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

describe("LaunchdScheduler.apply", () => {
  const linked = linkedPlistPath("test-job");
  const generated = generatedPlistPath("test-job");
  const logsDir = jobLogsDir("test-job");

  it("creates PLISTS_DIR, LAUNCH_AGENTS_DIR, and logs dir", async () => {
    const { fsOps, calls } = makeFsOps();
    const runner = makeRunner({ code: 0, stdout: "", stderr: "" });
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.apply(makeJob());
    const mkdirCalls = calls.filter((c) => c.op === "mkdir").map((c) => c.path);
    assert.ok(mkdirCalls.includes(PLISTS_DIR));
    assert.ok(mkdirCalls.includes(LAUNCH_AGENTS_DIR));
    assert.ok(mkdirCalls.includes(logsDir));
  });

  it("writes plist content from the builder to the generated path", async () => {
    const { fsOps, calls } = makeFsOps();
    const runner = makeRunner({ code: 0, stdout: "", stderr: "" });
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.apply(makeJob());
    const wf = calls.find((c) => c.op === "writeFile");
    assert.ok(wf && wf.op === "writeFile");
    assert.equal(wf.path, generated);
    assert.equal(wf.content, PLIST_CONTENT);
  });

  it("unlinks existing symlink then creates a new one", async () => {
    const { fsOps, calls } = makeFsOps();
    const runner = makeRunner({ code: 0, stdout: "", stderr: "" });
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.apply(makeJob());
    const unlinks = calls.filter((c) => c.op === "unlink").map((c) => c.path);
    const symlinks = calls
      .filter((c) => c.op === "symlink")
      .map((c) => ({
        target: (c as { op: "symlink"; target: string; path: string }).target,
        path: c.path,
      }));
    assert.ok(unlinks.includes(linked));
    assert.equal(symlinks.length, 1);
    assert.equal(symlinks[0].target, generated);
    assert.equal(symlinks[0].path, linked);
  });

  it("does not throw when unlink raises ENOENT (no pre-existing symlink)", async () => {
    const { fsOps } = makeFsOps({ [linked]: enoent() });
    const runner = makeRunner({ code: 0, stdout: "", stderr: "" });
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await assert.doesNotReject(() => sched.apply(makeJob()));
  });

  it("propagates non-ENOENT errors from unlink", async () => {
    const { fsOps } = makeFsOps({ [linked]: eperm() });
    const runner = makeRunner({ code: 0, stdout: "", stderr: "" });
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await assert.rejects(() => sched.apply(makeJob()), /EPERM/);
  });

  it("calls bootout then bootstrap when job is enabled", async () => {
    const { fsOps } = makeFsOps();
    const runnerCalls: [string, string[]][] = [];
    const runner = (cmd: string, args: string[]) => {
      runnerCalls.push([cmd, args]);
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    };
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.apply(makeJob({ enabled: true }));
    assert.equal(runnerCalls.length, 2);
    assert.equal(runnerCalls[0][1][0], "bootout");
    assert.equal(runnerCalls[1][1][0], "bootstrap");
  });

  it("calls bootout but not bootstrap when job is disabled", async () => {
    const { fsOps } = makeFsOps();
    const runnerCalls: [string, string[]][] = [];
    const runner = (cmd: string, args: string[]) => {
      runnerCalls.push([cmd, args]);
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    };
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.apply(makeJob({ enabled: false }));
    assert.equal(runnerCalls.length, 1);
    assert.equal(runnerCalls[0][1][0], "bootout");
  });

  it("throws SchedulerError when bootstrap exits non-zero", async () => {
    const { fsOps } = makeFsOps();
    let callCount = 0;
    const runner = (_cmd: string, _args: string[]) => {
      callCount++;
      const isBootstrap = callCount === 2;
      return Promise.resolve({
        code: isBootstrap ? 1 : 0,
        stdout: "",
        stderr: isBootstrap ? "service already loaded" : "",
      });
    };
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await assert.rejects(
      () => sched.apply(makeJob({ enabled: true })),
      (err: unknown) => {
        assert.ok(err instanceof SchedulerError);
        assert.match(err.message, /service already loaded/);
        return true;
      },
    );
  });
});

describe("LaunchdScheduler.unload", () => {
  const name = JobName.parse("test-job");
  const linked = linkedPlistPath("test-job");
  const generated = generatedPlistPath("test-job");

  it("calls bootout and unlinks both the linked and generated plist", async () => {
    const { fsOps, calls } = makeFsOps();
    const runnerCalls: string[][] = [];
    const runner = (_cmd: string, args: string[]) => {
      runnerCalls.push(args);
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    };
    const sched = new LaunchdScheduler(stubPlist, runner, fsOps);
    await sched.unload(name);
    assert.equal(runnerCalls.length, 1);
    assert.equal(runnerCalls[0][0], "bootout");
    const unlinked = calls.filter((c) => c.op === "unlink").map((c) => c.path);
    assert.ok(unlinked.includes(linked));
    assert.ok(unlinked.includes(generated));
  });

  it("does not throw when linked plist unlink raises ENOENT", async () => {
    const { fsOps } = makeFsOps({ [linked]: enoent() });
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 0, stdout: "", stderr: "" }),
      fsOps,
    );
    await assert.doesNotReject(() => sched.unload(name));
  });

  it("does not throw when generated plist unlink raises ENOENT", async () => {
    const { fsOps } = makeFsOps({ [generated]: enoent() });
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 0, stdout: "", stderr: "" }),
      fsOps,
    );
    await assert.doesNotReject(() => sched.unload(name));
  });

  it("propagates non-ENOENT errors from linked plist unlink", async () => {
    const { fsOps } = makeFsOps({ [linked]: eperm() });
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 0, stdout: "", stderr: "" }),
      fsOps,
    );
    await assert.rejects(() => sched.unload(name), /EPERM/);
  });

  it("propagates non-ENOENT errors from generated plist unlink", async () => {
    const { fsOps } = makeFsOps({ [generated]: eperm() });
    const sched = new LaunchdScheduler(
      stubPlist,
      makeRunner({ code: 0, stdout: "", stderr: "" }),
      fsOps,
    );
    await assert.rejects(() => sched.unload(name), /EPERM/);
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
