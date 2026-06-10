import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeStopJob } from "./StopJobUseCase.js";
import { NotFoundError } from "../../domain/errors.js";
import { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import { JobName } from "../../domain/job/JobName.js";
import { CronSchedule } from "../../domain/job/CronSchedule.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

function makeJob(nameStr: string): Job {
  return Job.create({
    name: JobName.parse(nameStr),
    enabled: true,
    schedule: CronSchedule.parse("0 9 * * *"),
    workingDirectory: "/tmp",
    prompt: "hello",
    provider: "claude",
    claudeArgs: [],
  });
}

function makeRepo(job: Job | null): JobRepository {
  return {
    list: async () => (job ? [job] : []),
    find: async () => job,
    save: async () => {},
    delete: async () => true,
  };
}

function makeScheduler(opts: { stopFn?: () => Promise<void> } = {}): Scheduler & {
  stopped: JobName[];
} {
  const stopped: JobName[] = [];
  return {
    stopped,
    apply: async () => {},
    unload: async () => {},
    kickstart: async () => {},
    stop: async (name) => {
      if (opts.stopFn) await opts.stopFn();
      stopped.push(name);
    },
    statuses: async () => new Map(),
  };
}

describe("makeStopJob", () => {
  it("calls scheduler.stop when job exists", async () => {
    const name = JobName.parse("daily-review");
    const job = makeJob("daily-review");
    const repo = makeRepo(job);
    const scheduler = makeScheduler();
    const stopJob = makeStopJob({ jobs: repo, scheduler });

    await stopJob(name);

    assert.equal(scheduler.stopped.length, 1);
    assert.equal(scheduler.stopped[0].value, "daily-review");
  });

  it("throws NotFoundError when job does not exist", async () => {
    const name = JobName.parse("missing-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const stopJob = makeStopJob({ jobs: repo, scheduler });

    await assert.rejects(() => stopJob(name), NotFoundError);
    assert.equal(scheduler.stopped.length, 0);
  });

  it("error message includes the job name", async () => {
    const name = JobName.parse("my-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const stopJob = makeStopJob({ jobs: repo, scheduler });

    await assert.rejects(
      () => stopJob(name),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundError);
        assert.ok(
          err.message.includes("my-job"),
          `expected error message to include 'my-job', got: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("propagates errors from scheduler.stop", async () => {
    const name = JobName.parse("flaky-job");
    const job = makeJob("flaky-job");
    const repo = makeRepo(job);
    const scheduler = makeScheduler({
      stopFn: async () => {
        throw new Error("launchctl failed");
      },
    });
    const stopJob = makeStopJob({ jobs: repo, scheduler });

    await assert.rejects(() => stopJob(name), /launchctl failed/);
  });
});
