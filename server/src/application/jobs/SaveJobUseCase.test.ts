import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeSaveJob } from "./SaveJobUseCase.js";
import { ValidationError } from "../../domain/errors.js";
import { Job } from "../../domain/job/Job.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

const VALID_PAYLOAD = {
  name: "daily-review",
  enabled: true,
  schedule: { cron: "0 9 * * *" },
  working_directory: "/tmp",
  prompt: "hello",
  claude_args: [],
};

function makeRepo(opts: { saveFn?: () => Promise<void> } = {}): JobRepository & {
  saved: Job[];
} {
  const saved: Job[] = [];
  return {
    saved,
    list: async () => [],
    find: async () => null,
    save: async (job) => {
      if (opts.saveFn) await opts.saveFn();
      saved.push(job);
    },
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

describe("makeSaveJob", () => {
  it("returns the Job built from a valid payload", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    const result = await saveJob(VALID_PAYLOAD);

    assert.ok(result instanceof Job);
    assert.equal(result.name.value, "daily-review");
  });

  it("persists the job via repo.save", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await saveJob(VALID_PAYLOAD);

    assert.equal(repo.saved.length, 1);
    assert.equal(repo.saved[0].name.value, "daily-review");
  });

  it("applies the job to the scheduler", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await saveJob(VALID_PAYLOAD);

    assert.equal(scheduler.applied.length, 1);
    assert.equal(scheduler.applied[0].name.value, "daily-review");
  });

  it("throws ValidationError when payload is not an object", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await assert.rejects(() => saveJob("not-an-object"), ValidationError);
  });

  it("throws ValidationError when prompt is empty", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await assert.rejects(
      () => saveJob({ ...VALID_PAYLOAD, prompt: "   " }),
      ValidationError,
    );
  });

  it("propagates errors from repo.save", async () => {
    const repo = makeRepo({
      saveFn: async () => {
        throw new Error("yaml write failed");
      },
    });
    const scheduler = makeScheduler();
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await assert.rejects(() => saveJob(VALID_PAYLOAD), /yaml write failed/);
  });

  it("propagates errors from scheduler.apply", async () => {
    const repo = makeRepo();
    const scheduler = makeScheduler({
      applyFn: async () => {
        throw new Error("launchctl failed");
      },
    });
    const saveJob = makeSaveJob({ jobs: repo, scheduler });

    await assert.rejects(() => saveJob(VALID_PAYLOAD), /launchctl failed/);
  });
});
