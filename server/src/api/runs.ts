import { Hono } from "hono";
import { kickstart } from "../lib/launchctl.js";
import { readJob } from "../lib/jobs-store.js";

export const runsApi = new Hono();

runsApi.post("/:name/kickstart", async (c) => {
  const name = c.req.param("name");
  const job = await readJob(name);
  if (!job) return c.json({ error: "not found" }, 404);
  const r = await kickstart(name);
  if (r.code !== 0) {
    return c.json({ ok: false, error: r.stderr.trim() || "kickstart failed" }, 500);
  }
  return c.json({ ok: true });
});
