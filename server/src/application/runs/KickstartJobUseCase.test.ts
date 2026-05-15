import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeKickstartJob } from "./KickstartJobUseCase.js";
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

function makeScheduler(opts: { kickstartFn?: () => Promise<void> } = {}): Scheduler & {
  kickstarted: JobName[];
} {
  const kickstarted: JobName[] = [];
  return {
    kickstarted,
    apply: async () => {},
    unload: async () => {},
    kickstart: async (name) => {
      if (opts.kickstartFn) await opts.kickstartFn();
      kickstarted.push(name);
    },
    statuses: async () => new Map(),
  };
}

describe("makeKickstartJob", () => {
  it("calls scheduler.kickstart when job exists", async () => {
    const name = JobName.parse("daily-review");
    const job = makeJob("daily-review");
    const repo = makeRepo(job);
    const scheduler = makeScheduler();
    const kickstartJob = makeKickstartJob({ jobs: repo, scheduler });

    await kickstartJob(name);

    assert.equal(scheduler.kickstarted.length, 1);
    assert.equal(scheduler.kickstarted[0].value, "daily-review");
  });

  it("throws NotFoundError when job does not exist", async () => {
    const name = JobName.parse("missing-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const kickstartJob = makeKickstartJob({ jobs: repo, scheduler });

    await assert.rejects(() => kickstartJob(name), NotFoundError);
    assert.equal(scheduler.kickstarted.length, 0);
  });

  it("does not call scheduler when job is not found", async () => {
    const name = JobName.parse("ghost-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const kickstartJob = makeKickstartJob({ jobs: repo, scheduler });

    await assert.rejects(() => kickstartJob(name), NotFoundError);

    assert.equal(scheduler.kickstarted.length, 0);
  });

  it("error message includes the job name", async () => {
    const name = JobName.parse("my-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const kickstartJob = makeKickstartJob({ jobs: repo, scheduler });

    await assert.rejects(
      () => kickstartJob(name),
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

  it("propagates errors from scheduler.kickstart", async () => {
    const name = JobName.parse("flaky-job");
    const job = makeJob("flaky-job");
    const repo = makeRepo(job);
    const scheduler = makeScheduler({
      kickstartFn: async () => {
        throw new Error("launchctl failed");
      },
    });
    const kickstartJob = makeKickstartJob({ jobs: repo, scheduler });

    await assert.rejects(() => kickstartJob(name), /launchctl failed/);
  });
});
