import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeGetJob } from "./GetJobUseCase.js";
import { NotFoundError } from "../../domain/errors.js";
import { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import { JobName } from "../../domain/job/JobName.js";
import { CronSchedule } from "../../domain/job/CronSchedule.js";
import type { JobStatus, Scheduler } from "../../domain/scheduler/Scheduler.js";

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

function makeScheduler(
  statusMap: Map<string, JobStatus>,
): Scheduler & { statusCallCount: number } {
  let statusCallCount = 0;
  return {
    get statusCallCount() {
      return statusCallCount;
    },
    apply: async () => {},
    unload: async () => {},
    kickstart: async () => {},
    statuses: async () => {
      statusCallCount++;
      return statusMap;
    },
  };
}

describe("makeGetJob", () => {
  it("returns job and its status when both exist", async () => {
    const name = JobName.parse("daily-review");
    const job = makeJob("daily-review");
    const status: JobStatus = { loaded: true, pid: 42 };
    const repo = makeRepo(job);
    const scheduler = makeScheduler(new Map([["daily-review", status]]));
    const getJob = makeGetJob({ jobs: repo, scheduler });

    const result = await getJob(name);

    assert.equal(result.job, job);
    assert.deepEqual(result.status, status);
  });

  it("returns { loaded: false } when job exists but has no scheduler entry", async () => {
    const name = JobName.parse("unscheduled-job");
    const job = makeJob("unscheduled-job");
    const repo = makeRepo(job);
    const scheduler = makeScheduler(new Map());
    const getJob = makeGetJob({ jobs: repo, scheduler });

    const result = await getJob(name);

    assert.equal(result.job, job);
    assert.deepEqual(result.status, { loaded: false });
  });

  it("throws NotFoundError when job does not exist", async () => {
    const name = JobName.parse("missing-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler(new Map());
    const getJob = makeGetJob({ jobs: repo, scheduler });

    await assert.rejects(() => getJob(name), NotFoundError);
  });

  it("does not call scheduler.statuses when job is not found", async () => {
    const name = JobName.parse("ghost-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler(new Map());
    const getJob = makeGetJob({ jobs: repo, scheduler });

    await assert.rejects(() => getJob(name), NotFoundError);

    assert.equal(scheduler.statusCallCount, 0);
  });

  it("error message includes the job name", async () => {
    const name = JobName.parse("my-job");
    const repo = makeRepo(null);
    const scheduler = makeScheduler(new Map());
    const getJob = makeGetJob({ jobs: repo, scheduler });

    await assert.rejects(
      () => getJob(name),
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

  it("propagates errors from jobs.find", async () => {
    const name = JobName.parse("any-job");
    const repo: JobRepository = {
      list: async () => [],
      find: async () => {
        throw new Error("disk read failed");
      },
      save: async () => {},
      delete: async () => true,
    };
    const scheduler = makeScheduler(new Map());
    const getJob = makeGetJob({ jobs: repo, scheduler });

    await assert.rejects(() => getJob(name), /disk read failed/);
  });

  it("propagates errors from scheduler.statuses", async () => {
    const name = JobName.parse("daily-review");
    const job = makeJob("daily-review");
    const repo = makeRepo(job);
    const failScheduler: Scheduler = {
      apply: async () => {},
      unload: async () => {},
      kickstart: async () => {},
      statuses: async () => {
        throw new Error("launchctl list failed");
      },
    };
    const getJob = makeGetJob({ jobs: repo, scheduler: failScheduler });

    await assert.rejects(() => getJob(name), /launchctl list failed/);
  });
});
