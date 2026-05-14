import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jobsApi } from "./api/jobs.js";
import { logsApi } from "./api/logs.js";
import { pickerApi } from "./api/picker.js";
import { runsApi } from "./api/runs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.resolve(here, "..", "..", "web", "dist");

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route("/api/jobs", jobsApi);
app.route("/api/runs", runsApi);
app.route("/api/logs", logsApi);
app.route("/api/picker", pickerApi);

// Static SPA (production). Vite dev server proxies /api in dev.
app.get("*", async (c) => {
  const url = new URL(c.req.url);
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
    // fall through to index.html
  }
  try {
    const html = fs.readFileSync(path.join(WEB_DIST, "index.html"), "utf8");
    return c.html(html);
  } catch {
    return c.text(
      "web/dist not built yet. Run `npm run build` or use `npm run dev`.",
      503,
    );
  }
});

const port = Number(process.env.PORT ?? 7878);
const host = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname: host });
console.log(`claude-schedule-management server listening on http://${host}:${port}`);
