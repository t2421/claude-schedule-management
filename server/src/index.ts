import { serve } from "@hono/node-server";
import { compose } from "./composition.js";
import { buildApp } from "./interfaces/http/server.js";

// Runtime platform guard. The scheduler implementation only targets launchd,
// so anything else won't actually work end-to-end. We don't enforce this at
// install time (via package.json "os") because CI builds on Linux.
if (process.platform !== "darwin") {
  console.error(
    `claude-schedule-management runs on macOS only (detected: ${process.platform}). ` +
      `See ROADMAP.md for cross-platform plans.`,
  );
  process.exit(1);
}

const composition = compose();
const app = buildApp(composition);

const port = Number(process.env.PORT ?? 7878);
const host = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname: host });
console.log(`claude-schedule-management server listening on http://${host}:${port}`);
