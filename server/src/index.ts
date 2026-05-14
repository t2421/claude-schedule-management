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

const port = Number(process.env.PORT ?? 7878);
const host = process.env.HOST ?? "127.0.0.1";

const composition = compose();
const app = buildApp(composition, {
  // Match the bound host plus the universal loopback aliases. The optional
  // CLAUDE_SCHEDULE_EXTRA_HOSTS env (comma-separated) lets advanced users
  // permit additional names (e.g. a reverse-proxy hostname).
  allowedHosts: [
    `${host}:${port}`,
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
    ...(process.env.CLAUDE_SCHEDULE_EXTRA_HOSTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ],
});

serve({ fetch: app.fetch, port, hostname: host });
console.log(`claude-schedule-management server listening on http://${host}:${port}`);
