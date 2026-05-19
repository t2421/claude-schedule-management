import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeDeleteJob } from "./DeleteJobUseCase.js";
import type { JobRepository } from "../../domain/job/JobRepository.js";
import { JobName } from "../../domain/job/JobName.js";
import type { Scheduler } from "../../domain/scheduler/Scheduler.js";

function makeRepo(
  opts: {
    deleteResult?: boolean;
    deleteFn?: () => Promise<boolean>;
  } = {},
): JobRepository & { unloadOrder: string[] } {
  const unloadOrder: string[] = [];
  return {
    unloadOrder,
    list: async () => [],
    find: async () => null,
    save: async () => {},
    delete: async (name) => {
      unloadOrder.push(`delete:${name.value}`);
      if (opts.deleteFn) return opts.deleteFn();
      return opts.deleteResult ?? true;
    },
  };
}

function makeScheduler(opts: { unloadFn?: () => Promise<void> } = {}): Scheduler & {
  unloaded: JobName[];
} {
  const unloaded: JobName[] = [];
  return {
    unloaded,
    apply: async () => {},
    unload: async (name) => {
      if (opts.unloadFn) await opts.unloadFn();
      unloaded.push(name);
    },
    kickstart: async () => {},
    statuses: async () => new Map(),
  };
}

describe("makeDeleteJob", () => {
  it("calls scheduler.unload and repo.delete", async () => {
    const name = JobName.parse("daily-review");
    const repo = makeRepo();
    const scheduler = makeScheduler();
    const deleteJob = makeDeleteJob({ jobs: repo, scheduler });

    await deleteJob(name);

    assert.equal(scheduler.unloaded.length, 1);
    assert.equal(scheduler.unloaded[0].value, "daily-review");
    assert.equal(repo.unloadOrder.length, 1);
  });

  it("returns true when repo.delete returns true", async () => {
    const name = JobName.parse("daily-review");
    const repo = makeRepo({ deleteResult: true });
    const scheduler = makeScheduler();
    const deleteJob = makeDeleteJob({ jobs: repo, scheduler });

    const result = await deleteJob(name);

    assert.equal(result, true);
  });

  it("returns false when repo.delete returns false", async () => {
    const name = JobName.parse("nonexistent-job");
    const repo = makeRepo({ deleteResult: false });
    const scheduler = makeScheduler();
    const deleteJob = makeDeleteJob({ jobs: repo, scheduler });

    const result = await deleteJob(name);

    assert.equal(result, false);
  });

  it("propagates errors from scheduler.unload", async () => {
    const name = JobName.parse("flaky-job");
    const repo = makeRepo();
    const scheduler = makeScheduler({
      unloadFn: async () => {
        throw new Error("unload failed");
      },
    });
    const deleteJob = makeDeleteJob({ jobs: repo, scheduler });

    await assert.rejects(() => deleteJob(name), /unload failed/);
  });

  it("propagates errors from repo.delete", async () => {
    const name = JobName.parse("db-error-job");
    const repo = makeRepo({
      deleteFn: async () => {
        throw new Error("disk write failed");
      },
    });
    const scheduler = makeScheduler();
    const deleteJob = makeDeleteJob({ jobs: repo, scheduler });

    await assert.rejects(() => deleteJob(name), /disk write failed/);
  });
});
