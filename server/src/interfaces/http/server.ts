import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import type { Composition } from "../../composition.js";
import { jobsRoutes } from "./routes/jobs.js";
import { logsRoutes } from "./routes/logs.js";
import { pickerRoutes } from "./routes/picker.js";
import { runsRoutes } from "./routes/runs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, "..", "..", "..", "..", "web", "dist");

export function buildApp(c: Composition): Hono {
  const app = new Hono();

  app.get("/api/health", (ctx) =>
    ctx.json({ ok: true, time: new Date().toISOString() }),
  );

  app.route("/api/jobs", jobsRoutes(c));
  app.route("/api/runs", runsRoutes(c));
  app.route("/api/logs", logsRoutes(c));
  app.route("/api/picker", pickerRoutes(c));

  // Static SPA. Vite dev server proxies /api in development.
  app.get("*", async (ctx) => {
    const url = new URL(ctx.req.url);
    const candidate = path.join(WEB_DIST, url.pathname);
    try {
      if (
        url.pathname !== "/" &&
        candidate.startsWith(WEB_DIST) &&
        fs.statSync(candidate).isFile()
      ) {
        const ext = path.extname(candidate);
        const mime =
          ext === ".js" ? "application/javascript" :
          ext === ".css" ? "text/css" :
          ext === ".html" ? "text/html" :
          ext === ".svg" ? "image/svg+xml" :
          "application/octet-stream";
        return new Response(fs.readFileSync(candidate), {
          headers: { "content-type": mime },
        });
      }
    } catch {
      // fall through
    }
    try {
      const html = fs.readFileSync(path.join(WEB_DIST, "index.html"), "utf8");
      return ctx.html(html);
    } catch {
      return ctx.text(
        "web/dist not built yet. Run `npm run build` or use `npm run dev`.",
        503,
      );
    }
  });

  return app;
}
