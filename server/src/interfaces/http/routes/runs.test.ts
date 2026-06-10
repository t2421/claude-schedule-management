import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runsRoutes } from "./runs.js";
import { NotFoundError, SchedulerError } from "../../../domain/errors.js";
import type { Composition } from "../../../composition.js";
import type { JobName } from "../../../domain/job/JobName.js";

function makeComposition(opts: {
  kickstartFn?: (name: JobName) => Promise<void>;
  stopFn?: (name: JobName) => Promise<void>;
} = {}): Composition {
  return {
    useCases: {
      kickstartJob: opts.kickstartFn ?? (async () => {}),
      stopJob: opts.stopFn ?? (async () => {}),
    },
  } as unknown as Composition;
}

describe("runsRoutes", () => {
  it("POST /:name/kickstart returns {ok:true} and forwards name to use case", async () => {
    const kicked: string[] = [];
    const app = runsRoutes(
      makeComposition({ kickstartFn: async (name) => { kicked.push(name.value); } }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(kicked, ["daily-review"]);
  });

  it("POST /:name/kickstart returns 400 when name fails validation", async () => {
    const app = runsRoutes(makeComposition());

    const res = await app.request("/INVALID/kickstart", { method: "POST" });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: unknown };
    assert.ok(typeof body.error === "string", "response must carry an error string");
  });

  it("POST /:name/kickstart returns 404 when use case throws NotFoundError", async () => {
    const app = runsRoutes(
      makeComposition({ kickstartFn: async () => { throw new NotFoundError("job 'missing' not found"); } }),
    );

    const res = await app.request("/missing/kickstart", { method: "POST" });

    assert.equal(res.status, 404);
    const body = (await res.json()) as { error?: string };
    assert.ok(
      body.error?.includes("missing"),
      `expected error to mention 'missing', got: ${body.error}`,
    );
  });

  it("POST /:name/kickstart returns 500 with ok:false when use case throws SchedulerError", async () => {
    const app = runsRoutes(
      makeComposition({ kickstartFn: async () => { throw new SchedulerError("launchctl exited with code 1"); } }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 500);
    const body = (await res.json()) as { ok?: boolean };
    assert.equal(body.ok, false);
  });

  it("POST /:name/kickstart returns 500 for unexpected errors", async () => {
    const app = runsRoutes(
      makeComposition({ kickstartFn: async () => { throw new Error("unexpected failure"); } }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 500);
  });

  it("POST /:name/stop returns {ok:true} and forwards name to use case", async () => {
    const stopped: string[] = [];
    const app = runsRoutes(
      makeComposition({ stopFn: async (name) => { stopped.push(name.value); } }),
    );

    const res = await app.request("/daily-review/stop", { method: "POST" });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(stopped, ["daily-review"]);
  });

  it("POST /:name/stop returns 400 when name fails validation", async () => {
    const app = runsRoutes(makeComposition());

    const res = await app.request("/INVALID/stop", { method: "POST" });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: unknown };
    assert.ok(typeof body.error === "string");
  });

  it("POST /:name/stop returns 404 when use case throws NotFoundError", async () => {
    const app = runsRoutes(
      makeComposition({ stopFn: async () => { throw new NotFoundError("job 'missing' not found"); } }),
    );

    const res = await app.request("/missing/stop", { method: "POST" });

    assert.equal(res.status, 404);
  });

  it("POST /:name/stop returns 500 with ok:false when scheduler throws SchedulerError", async () => {
    const app = runsRoutes(
      makeComposition({ stopFn: async () => { throw new SchedulerError("kill failed"); } }),
    );

    const res = await app.request("/daily-review/stop", { method: "POST" });

    assert.equal(res.status, 500);
    const body = (await res.json()) as { ok?: boolean };
    assert.equal(body.ok, false);
  });
});
