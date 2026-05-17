import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jobsRoutes } from "./jobs.js";
import { NotFoundError, ValidationError } from "../../../domain/errors.js";
import { Job } from "../../../domain/job/Job.js";
import { JobName } from "../../../domain/job/JobName.js";
import { CronSchedule } from "../../../domain/job/CronSchedule.js";
import type { JobStatus } from "../../../domain/scheduler/Scheduler.js";
import type { Orphan } from "../../../domain/scheduler/Orphan.js";
import type { Composition } from "../../../composition.js";

function makeJob(nameStr = "daily-review"): Job {
  return Job.create({
    name: JobName.parse(nameStr),
    enabled: true,
    schedule: CronSchedule.parse("0 9 * * *"),
    workingDirectory: "/home/user/project",
    prompt: "Review the daily summary",
    claudeArgs: ["-p"],
  });
}

function makeStatus(overrides: Partial<JobStatus> = {}): JobStatus {
  return { loaded: true, ...overrides };
}

function makeComposition(overrides: Partial<Composition["useCases"]> = {}): Composition {
  const defaults: Composition["useCases"] = {
    listJobs: async () => ({ jobs: [], orphans: [] }),
    getJob: async () => ({ job: makeJob(), status: makeStatus() }),
    saveJob: async () => makeJob(),
    deleteJob: async () => true,
    applyJob: async () => {},
    removeOrphan: async () => {},
    kickstartJob: async () => {},
    listLogs: async () => [],
    readLog: async () => "",
    pickFolder: async () => "/some/path",
  };
  return { useCases: { ...defaults, ...overrides } } as unknown as Composition;
}

describe("jobsRoutes", () => {
  describe("GET /", () => {
    it("returns jobs and orphans from listJobs", async () => {
      const job = makeJob();
      const status = makeStatus({ loaded: false });
      const orphan: Orphan = {
        name: "stale",
        label: "local.claude-schedule.job.stale",
        loaded: false,
        inAgentsDir: true,
        inLocalPlists: false,
      };
      const app = jobsRoutes(
        makeComposition({
          listJobs: async () => ({
            jobs: [{ job, status }],
            orphans: [orphan],
          }),
        }),
      );

      const res = await app.request("/", { method: "GET" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { jobs: unknown[]; orphans: { label: string }[] };
      assert.equal(body.jobs.length, 1);
      assert.equal(body.orphans.length, 1);
      assert.equal(body.orphans[0].label, "local.claude-schedule.job.stale");
    });

    it("returns 500 when listJobs throws", async () => {
      const app = jobsRoutes(
        makeComposition({
          listJobs: async () => {
            throw new Error("db error");
          },
        }),
      );

      const res = await app.request("/", { method: "GET" });

      assert.equal(res.status, 500);
    });
  });

  describe("GET /:name", () => {
    it("returns job and status for a valid name", async () => {
      const job = makeJob("daily-review");
      const app = jobsRoutes(
        makeComposition({
          getJob: async () => ({ job, status: makeStatus({ pid: 42 }) }),
        }),
      );

      const res = await app.request("/daily-review", { method: "GET" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { job: { name: string }; status: unknown };
      assert.equal(body.job.name, "daily-review");
    });

    it("returns 400 for an invalid job name", async () => {
      const app = jobsRoutes(makeComposition());

      const res = await app.request("/INVALID_NAME", { method: "GET" });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { error?: string };
      assert.ok(typeof body.error === "string");
    });

    it("returns 404 when getJob throws NotFoundError", async () => {
      const app = jobsRoutes(
        makeComposition({
          getJob: async () => {
            throw new NotFoundError("job 'missing' not found");
          },
        }),
      );

      const res = await app.request("/missing", { method: "GET" });
      assert.equal(res.status, 404);
    });

    it("returns 500 for unexpected errors", async () => {
      const app = jobsRoutes(
        makeComposition({
          getJob: async () => {
            throw new Error("unexpected");
          },
        }),
      );

      const res = await app.request("/daily-review", { method: "GET" });

      assert.equal(res.status, 500);
    });
  });

  describe("PUT /:name", () => {
    it("returns ok:true and the saved job", async () => {
      const saved = makeJob("daily-review");
      const app = jobsRoutes(
        makeComposition({
          saveJob: async () => saved,
        }),
      );

      const res = await app.request("/daily-review", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "daily-review",
          enabled: true,
          schedule: { cron: "0 9 * * *" },
          working_directory: "/home/user/project",
          prompt: "Review the daily summary",
          claude_args: ["-p"],
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean; job: { name: string } };
      assert.equal(body.ok, true);
      assert.equal(body.job.name, "daily-review");
    });

    it("returns 400 when saveJob throws ValidationError", async () => {
      const app = jobsRoutes(
        makeComposition({
          saveJob: async () => {
            throw new ValidationError("prompt is required");
          },
        }),
      );

      const res = await app.request("/daily-review", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 400);
    });

    it("returns 500 for unexpected errors from saveJob", async () => {
      const app = jobsRoutes(
        makeComposition({
          saveJob: async () => {
            throw new Error("disk full");
          },
        }),
      );

      const res = await app.request("/daily-review", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 500);
    });
  });

  describe("DELETE /:name", () => {
    it("returns ok:true when deleteJob succeeds", async () => {
      const app = jobsRoutes(
        makeComposition({
          deleteJob: async () => true,
        }),
      );

      const res = await app.request("/daily-review", { method: "DELETE" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { ok: boolean };
      assert.equal(body.ok, true);
    });

    it("returns 400 for an invalid job name", async () => {
      const app = jobsRoutes(makeComposition());

      const res = await app.request("/BAD__NAME", { method: "DELETE" });

      assert.equal(res.status, 400);
    });

    it("returns 404 when deleteJob throws NotFoundError", async () => {
      const app = jobsRoutes(
        makeComposition({
          deleteJob: async () => {
            throw new NotFoundError("job 'missing' not found");
          },
        }),
      );

      const res = await app.request("/missing", { method: "DELETE" });

      assert.equal(res.status, 404);
    });
  });

  describe("POST /:name/apply", () => {
    it("returns ok:true when applyJob succeeds", async () => {
      const applied: string[] = [];
      const app = jobsRoutes(
        makeComposition({
          applyJob: async (name) => {
            applied.push(name.value);
          },
        }),
      );

      const res = await app.request("/daily-review/apply", { method: "POST" });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.deepEqual(applied, ["daily-review"]);
    });

    it("returns 400 for an invalid job name", async () => {
      const app = jobsRoutes(makeComposition());

      const res = await app.request("/BADNAME/apply", { method: "POST" });
      assert.equal(res.status, 400);
    });

    it("returns 404 when applyJob throws NotFoundError", async () => {
      const app = jobsRoutes(
        makeComposition({
          applyJob: async () => {
            throw new NotFoundError("job 'ghost' not found");
          },
        }),
      );

      const res = await app.request("/ghost/apply", { method: "POST" });

      assert.equal(res.status, 404);
    });

    it("returns 500 for unexpected errors from applyJob", async () => {
      const app = jobsRoutes(
        makeComposition({
          applyJob: async () => {
            throw new Error("scheduler crash");
          },
        }),
      );

      const res = await app.request("/daily-review/apply", { method: "POST" });

      assert.equal(res.status, 500);
    });
  });

  describe("POST /orphans/remove", () => {
    it("returns ok:true and forwards the label", async () => {
      const removed: string[] = [];
      const app = jobsRoutes(
        makeComposition({
          removeOrphan: async (label) => {
            removed.push(label);
          },
        }),
      );

      const res = await app.request("/orphans/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "local.claude-schedule.job.stale" }),
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.deepEqual(removed, ["local.claude-schedule.job.stale"]);
    });

    it("uses empty string when label is absent from body", async () => {
      const removed: string[] = [];
      const app = jobsRoutes(
        makeComposition({
          removeOrphan: async (label) => {
            removed.push(label);
          },
        }),
      );

      const res = await app.request("/orphans/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.equal(res.status, 200);
      assert.deepEqual(removed, [""]);
    });

    it("returns 500 when removeOrphan throws", async () => {
      const app = jobsRoutes(
        makeComposition({
          removeOrphan: async () => {
            throw new Error("launchctl error");
          },
        }),
      );

      const res = await app.request("/orphans/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "some.label" }),
      });

      assert.equal(res.status, 500);
    });
  });
});
