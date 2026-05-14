import { serve } from "@hono/node-server";
import { compose } from "./composition.js";
import { buildApp } from "./interfaces/http/server.js";

const composition = compose();
const app = buildApp(composition);

const port = Number(process.env.PORT ?? 7878);
const host = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, port, hostname: host });
console.log(`claude-schedule-management server listening on http://${host}:${port}`);
