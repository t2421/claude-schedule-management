import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeListJobs } from "./ListJobsUseCase.js";
import { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import { JobName } from "../../domain/job/JobName.js";
import { CronSchedule } from "../../domain/job/CronSchedule.js";
import type { JobStatus, Scheduler } from "../../domain/scheduler/Scheduler.js";
import type { Orphan } from "../../domain/scheduler/Orphan.js";
import type { OrphanScanner } from "../../domain/scheduler/OrphanScanner.js";

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

function makeRepo(jobs: Job[]): JobRepository {
  return {
    list: async () => jobs,
    find: async (name) => jobs.find((j) => j.name.value === name.value) ?? null,
    save: async () => {},
    delete: async () => true,
  };
}

function makeScheduler(statusMap: Map<string, JobStatus>): Scheduler {
  return {
    apply: async () => {},
    unload: async () => {},
    kickstart: async () => {},
    statuses: async () => statusMap,
  };
}

function makeOrphanScanner(
  orphans: Orphan[],
  capturedKnown?: { value: Set<string> },
): OrphanScanner {
  return {
    scan: async (known) => {
      if (capturedKnown) capturedKnown.value = known;
      return orphans;
    },
    removeByLabel: async () => {},
  };
}

function makeOrphan(label: string): Orphan {
  return {
    name: label.split(".").at(-1) ?? label,
    label,
    loaded: true,
    inAgentsDir: false,
    inLocalPlists: true,
  };
}

describe("makeListJobs", () => {
  it("returns jobs with statuses and empty orphans when everything matches", async () => {
    const job = makeJob("daily-review");
    const status: JobStatus = { loaded: true, pid: 42 };
    const repo = makeRepo([job]);
    const scheduler = makeScheduler(new Map([["daily-review", status]]));
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    const result = await listJobs();

    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].job, job);
    assert.deepEqual(result.jobs[0].status, status);
    assert.deepEqual(result.orphans, []);
  });

  it("returns { loaded: false } for a job with no scheduler entry", async () => {
    const job = makeJob("unscheduled");
    const repo = makeRepo([job]);
    const scheduler = makeScheduler(new Map());
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    const result = await listJobs();

    assert.deepEqual(result.jobs[0].status, { loaded: false });
  });

  it("returns empty jobs and empty orphans when the repository is empty", async () => {
    const repo = makeRepo([]);
    const scheduler = makeScheduler(new Map());
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    const result = await listJobs();

    assert.deepEqual(result.jobs, []);
    assert.deepEqual(result.orphans, []);
  });

  it("passes known job names to the orphan scanner", async () => {
    const jobA = makeJob("job-a");
    const jobB = makeJob("job-b");
    const repo = makeRepo([jobA, jobB]);
    const scheduler = makeScheduler(new Map());
    const capturedKnown = { value: new Set<string>() };
    const scanner = makeOrphanScanner([], capturedKnown);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    await listJobs();

    assert.ok(capturedKnown.value.has("job-a"));
    assert.ok(capturedKnown.value.has("job-b"));
    assert.equal(capturedKnown.value.size, 2);
  });

  it("returns orphans alongside jobs", async () => {
    const job = makeJob("known-job");
    const orphan = makeOrphan("local.claude-schedule.ghost-job");
    const repo = makeRepo([job]);
    const scheduler = makeScheduler(new Map());
    const scanner = makeOrphanScanner([orphan]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    const result = await listJobs();

    assert.equal(result.orphans.length, 1);
    assert.equal(result.orphans[0].label, "local.claude-schedule.ghost-job");
  });

  it("preserves order of jobs as returned by the repository", async () => {
    const jobA = makeJob("alpha");
    const jobB = makeJob("beta");
    const jobC = makeJob("gamma");
    const repo = makeRepo([jobA, jobB, jobC]);
    const scheduler = makeScheduler(new Map());
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    const result = await listJobs();

    assert.deepEqual(
      result.jobs.map((r) => r.job.name.value),
      ["alpha", "beta", "gamma"],
    );
  });

  it("propagates errors from jobs.list", async () => {
    const repo: JobRepository = {
      list: async () => {
        throw new Error("disk read failed");
      },
      find: async () => null,
      save: async () => {},
      delete: async () => true,
    };
    const scheduler = makeScheduler(new Map());
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    await assert.rejects(() => listJobs(), /disk read failed/);
  });

  it("propagates errors from scheduler.statuses", async () => {
    const repo = makeRepo([makeJob("some-job")]);
    const scheduler: Scheduler = {
      apply: async () => {},
      unload: async () => {},
      kickstart: async () => {},
      statuses: async () => {
        throw new Error("launchctl list failed");
      },
    };
    const scanner = makeOrphanScanner([]);
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    await assert.rejects(() => listJobs(), /launchctl list failed/);
  });

  it("propagates errors from orphans.scan", async () => {
    const repo = makeRepo([makeJob("some-job")]);
    const scheduler = makeScheduler(new Map());
    const scanner: OrphanScanner = {
      scan: async () => {
        throw new Error("scan exploded");
      },
      removeByLabel: async () => {},
    };
    const listJobs = makeListJobs({ jobs: repo, scheduler, orphans: scanner });

    await assert.rejects(() => listJobs(), /scan exploded/);
  });
});
