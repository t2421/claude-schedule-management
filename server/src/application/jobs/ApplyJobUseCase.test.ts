import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeApplyJob } from "./ApplyJobUseCase.js";
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

function makeScheduler(opts: { applyFn?: () => Promise<void> } = {}): Scheduler & {
  applied: Job[];
} {
  const applied: Job[] = [];
  return {
    applied,
    apply: async (job) => {
      if (opts.applyFn) await opts.applyFn();
      applied.push(job);
    },
    unload: async () => {},
    kickstart: async () => {},
    statuses: async () => new Map(),
  };
}

describe("makeApplyJob", () => {
  it("calls scheduler.apply with the found job", async () => {
    const name = JobName.parse("daily-review");
    const job = makeJob("daily-review");
    const repo = makeRepo(job);
    const scheduler = makeScheduler();
    const applyJob = makeApplyJob({ jobs: repo, scheduler });

    await applyJob(name);

    assert.equal(scheduler.applied.length, 1);
    assert.equal(scheduler.applied[0].name.value, "daily-review");
  });

  it("throws NotFoundError when job does not exist", async () => {
    const name = JobName.parse("missing-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const applyJob = makeApplyJob({ jobs: repo, scheduler });

    await assert.rejects(() => applyJob(name), NotFoundError);
  });

  it("does not call scheduler when job is not found", async () => {
    const name = JobName.parse("ghost-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const applyJob = makeApplyJob({ jobs: repo, scheduler });

    await assert.rejects(() => applyJob(name), NotFoundError);

    assert.equal(scheduler.applied.length, 0);
  });

  it("error message includes the job name", async () => {
    const name = JobName.parse("my-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler();
    const applyJob = makeApplyJob({ jobs: repo, scheduler });

    await assert.rejects(
      () => applyJob(name),
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

  it("propagates errors from scheduler.apply", async () => {
    const name = JobName.parse("flaky-job");
    const job = makeJob("flaky-job");
    const repo = makeRepo(job);
    const scheduler = makeScheduler({
      applyFn: async () => {
        throw new Error("launchctl failed");
      },
    });
    const applyJob = makeApplyJob({ jobs: repo, scheduler });

    await assert.rejects(() => applyJob(name), /launchctl failed/);
  });
});
