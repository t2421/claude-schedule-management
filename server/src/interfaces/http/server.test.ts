import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./server.js";
import type { Composition } from "../../composition.js";

function makeComposition(): Composition {
  const useCases: Composition["useCases"] = {
    listJobs: async () => ({ jobs: [], orphans: [] }),
    getJob: async () => {
      throw new Error("not implemented");
    },
    saveJob: async () => {
      throw new Error("not implemented");
    },
    deleteJob: async () => true,
    applyJob: async () => {},
    removeOrphan: async () => {},
    kickstartJob: async () => {},
    listLogs: async () => [],
    readLog: async () => "",
    pickFolder: async () => "/some/path",
  };
  return { useCases } as unknown as Composition;
}

const ALLOWED_HOST = "localhost:3000";
const opts = { allowedHosts: [ALLOWED_HOST] };

describe("buildApp — host-header allowlist (DNS-rebinding defence)", () => {
  it("passes through a request whose Host matches the allowlist", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health", {
      headers: { host: ALLOWED_HOST },
    });
    assert.equal(res.status, 200);
  });

  it("returns 403 when Host is not in the allowlist", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health", {
      headers: { host: "evil.example.com" },
    });
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "forbidden host");
  });

  it("returns 403 when no Host header is present", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health");
    assert.equal(res.status, 403);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "forbidden host");
  });

  it("matches Host case-insensitively (upper-case request header)", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health", {
      headers: { host: "LOCALHOST:3000" },
    });
    assert.equal(res.status, 200);
  });

  it("matches Host case-insensitively (upper-case allowlist entry)", async () => {
    const app = buildApp(makeComposition(), { allowedHosts: ["LOCALHOST:3000"] });
    const res = await app.request("/api/health", {
      headers: { host: "localhost:3000" },
    });
    assert.equal(res.status, 200);
  });

  it("accepts any host when multiple entries are allowed", async () => {
    const app = buildApp(makeComposition(), {
      allowedHosts: ["localhost:3000", "127.0.0.1:3000"],
    });

    const r1 = await app.request("/api/health", {
      headers: { host: "localhost:3000" },
    });
    assert.equal(r1.status, 200);

    const r2 = await app.request("/api/health", {
      headers: { host: "127.0.0.1:3000" },
    });
    assert.equal(r2.status, 200);
  });

  it("still rejects a disallowed host when multiple entries are configured", async () => {
    const app = buildApp(makeComposition(), {
      allowedHosts: ["localhost:3000", "127.0.0.1:3000"],
    });
    const res = await app.request("/api/health", {
      headers: { host: "attacker.example.com" },
    });
    assert.equal(res.status, 403);
  });

  it("rejects every request when allowedHosts is empty", async () => {
    const app = buildApp(makeComposition(), { allowedHosts: [] });
    const res = await app.request("/api/health", {
      headers: { host: "localhost:3000" },
    });
    assert.equal(res.status, 403);
  });

  it("rejects a portless Host when the allowlist entry includes a port", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health", {
      headers: { host: "localhost" },
    });
    assert.equal(res.status, 403);
  });

  it("ignores X-Forwarded-Host — only the Host header governs access", async () => {
    const app = buildApp(makeComposition(), opts);
    // Attacker supplies a trusted X-Forwarded-Host while Host is absent.
    const res = await app.request("/api/health", {
      headers: { "x-forwarded-host": ALLOWED_HOST },
    });
    assert.equal(res.status, 403);
  });

  it("rejects requests to API sub-routes when Host is unknown", async () => {
    const app = buildApp(makeComposition(), opts);
    const apiRoutes = ["/api/jobs", "/api/runs", "/api/logs", "/api/picker"];
    for (const route of apiRoutes) {
      const res = await app.request(route, {
        headers: { host: "evil.example.com" },
      });
      assert.equal(res.status, 403, `expected 403 for ${route}`);
    }
  });
});

describe("buildApp — GET /api/health", () => {
  it("returns ok:true with an ISO-8601 time field", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/api/health", {
      headers: { host: ALLOWED_HOST },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; time: string };
    assert.equal(body.ok, true);
    assert.match(body.time, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("buildApp — SPA fallback", () => {
  it("SPA routes return a 2xx response (dist present) or 503 (dist absent)", async () => {
    const app = buildApp(makeComposition(), opts);
    const res = await app.request("/", { headers: { host: ALLOWED_HOST } });
    assert.ok(
      res.status === 200 || res.status === 503,
      `expected 200 or 503, got ${res.status}`,
    );
  });
});
