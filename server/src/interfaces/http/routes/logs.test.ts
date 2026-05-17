import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logsRoutes } from "./logs.js";
import type { Composition } from "../../../composition.js";
import type { LogFile } from "../../../domain/logs/LogReader.js";
import type { JobName } from "../../../domain/job/JobName.js";

function makeComposition(overrides: Partial<Composition["useCases"]> = {}): Composition {
  const defaults: Composition["useCases"] = {
    listJobs: async () => ({ jobs: [], orphans: [] }),
    getJob: async () => { throw new Error("not implemented"); },
    saveJob: async () => { throw new Error("not implemented"); },
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

describe("logsRoutes", () => {
  describe("GET /:name", () => {
    it("returns files list from listLogs", async () => {
      const logFiles: LogFile[] = [
        { file: "stdout-2025-01-01.log", size: 1024, mtime: "2025-01-01T00:00:00.000Z" },
        { file: "stderr-2025-01-01.log", size: 512, mtime: "2025-01-01T00:00:00.000Z" },
      ];
      const app = logsRoutes(
        makeComposition({
          listLogs: async () => logFiles,
        }),
      );

      const res = await app.request("/daily-review", { method: "GET" });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { files: LogFile[] };
      assert.equal(body.files.length, 2);
      assert.equal(body.files[0].file, "stdout-2025-01-01.log");
    });

    it("returns 400 for an invalid job name", async () => {
      const app = logsRoutes(makeComposition());

      const res = await app.request("/INVALID_NAME", { method: "GET" });

      assert.equal(res.status, 400);
    });

    it("returns 500 when listLogs throws", async () => {
      const app = logsRoutes(
        makeComposition({
          listLogs: async () => {
            throw new Error("fs error");
          },
        }),
      );

      const res = await app.request("/daily-review", { method: "GET" });

      assert.equal(res.status, 500);
    });

    it("forwards the parsed job name to listLogs", async () => {
      const captured: string[] = [];
      const app = logsRoutes(
        makeComposition({
          listLogs: async (name: JobName) => {
            captured.push(name.value);
            return [];
          },
        }),
      );

      await app.request("/my-job", { method: "GET" });

      assert.deepEqual(captured, ["my-job"]);
    });
  });

  describe("GET /:name/:file", () => {
    it("returns log content as plain text", async () => {
      const app = logsRoutes(
        makeComposition({
          readLog: async () => "line1\nline2\n",
        }),
      );

      const res = await app.request("/daily-review/stdout.log", { method: "GET" });

      assert.equal(res.status, 200);
      const text = await res.text();
      assert.equal(text, "line1\nline2\n");
    });

    it("passes tail query param as number to readLog", async () => {
      const captured: Array<{ file: string; tailBytes: number | undefined }> = [];
      const app = logsRoutes(
        makeComposition({
          readLog: async (_name, file, tailBytes) => {
            captured.push({ file, tailBytes });
            return "last bytes";
          },
        }),
      );

      const res = await app.request("/daily-review/stdout.log?tail=1024", { method: "GET" });

      assert.equal(res.status, 200);
      assert.equal(captured.length, 1);
      assert.equal(captured[0].tailBytes, 1024);
      assert.equal(captured[0].file, "stdout.log");
    });

    it("passes undefined tailBytes when tail param is absent", async () => {
      const captured: Array<number | undefined> = [];
      const app = logsRoutes(
        makeComposition({
          readLog: async (_name, _file, tailBytes) => {
            captured.push(tailBytes);
            return "";
          },
        }),
      );

      await app.request("/daily-review/stdout.log", { method: "GET" });

      assert.equal(captured[0], undefined);
    });

    it("returns 400 for an invalid job name", async () => {
      const app = logsRoutes(makeComposition());

      const res = await app.request("/BAD__NAME/stdout.log", { method: "GET" });

      assert.equal(res.status, 400);
    });

    it("returns 404 when readLog throws ENOENT", async () => {
      const app = logsRoutes(
        makeComposition({
          readLog: async () => {
            const e = Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
            throw e;
          },
        }),
      );

      const res = await app.request("/daily-review/missing.log", { method: "GET" });

      assert.equal(res.status, 404);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "not found");
    });

    it("returns 500 for unexpected readLog errors", async () => {
      const app = logsRoutes(
        makeComposition({
          readLog: async () => {
            throw new Error("disk read error");
          },
        }),
      );

      const res = await app.request("/daily-review/stdout.log", { method: "GET" });

      assert.equal(res.status, 500);
    });
  });
});
