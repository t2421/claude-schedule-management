import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runsRoutes } from "./runs.js";
import { NotFoundError, SchedulerError } from "../../../domain/errors.js";
import type { Composition } from "../../../composition.js";
import type { JobName } from "../../../domain/job/JobName.js";

function makeComposition(
  kickstartFn: (name: JobName) => Promise<void> = async () => {},
): Composition {
  return { useCases: { kickstartJob: kickstartFn } } as unknown as Composition;
}

describe("runsRoutes", () => {
  it("POST /:name/kickstart returns {ok:true} and forwards name to use case", async () => {
    const kicked: string[] = [];
    const app = runsRoutes(
      makeComposition(async (name) => {
        kicked.push(name.value);
      }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.deepEqual(kicked, ["daily-review"]);
  });

  it("POST /:name/kickstart returns 400 when name fails validation", async () => {
    // Job names must match /^[a-z0-9][a-z0-9-]*$/ — uppercase letters are
    // rejected by JobName.parse before the use case is ever called.
    const app = runsRoutes(makeComposition());

    const res = await app.request("/INVALID/kickstart", { method: "POST" });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error?: unknown };
    assert.ok(typeof body.error === "string", "response must carry an error string");
  });

  it("POST /:name/kickstart returns 404 when use case throws NotFoundError", async () => {
    const app = runsRoutes(
      makeComposition(async () => {
        throw new NotFoundError("job 'missing' not found");
      }),
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
      makeComposition(async () => {
        throw new SchedulerError("launchctl exited with code 1");
      }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 500);
    const body = (await res.json()) as { ok?: boolean };
    assert.equal(body.ok, false);
  });

  it("POST /:name/kickstart returns 500 for unexpected errors", async () => {
    const app = runsRoutes(
      makeComposition(async () => {
        throw new Error("unexpected failure");
      }),
    );

    const res = await app.request("/daily-review/kickstart", { method: "POST" });

    assert.equal(res.status, 500);
  });
});
