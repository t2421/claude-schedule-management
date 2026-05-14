import { Hono } from "hono";
import {
  deleteJob,
  listJobs,
  readJob,
  validateJob,
  writeJob,
} from "../lib/jobs-store.js";
import {
  applyJob,
  listLoaded,
  listOrphans,
  unloadJob,
} from "../lib/launchctl.js";

export const jobsApi = new Hono();

jobsApi.get("/", async (c) => {
  const jobs = await listJobs();
  const loaded = await listLoaded();
  const known = new Set(jobs.map((j) => j.name));
  const orphans = await listOrphans(known);
  return c.json({
    jobs: jobs.map((j) => ({
      ...j,
      status: loaded.get(j.name) ?? { name: j.name, loaded: false },
    })),
    orphans,
  });
});

jobsApi.get("/:name", async (c) => {
  const name = c.req.param("name");
  const job = await readJob(name);
  if (!job) return c.json({ error: "not found" }, 404);
  const loaded = await listLoaded();
  return c.json({
    job,
    status: loaded.get(name) ?? { name, loaded: false },
  });
});

jobsApi.put("/:name", async (c) => {
  const name = c.req.param("name");
  const body = await c.req.json();
  try {
    const job = validateJob({ ...body, name });
    await writeJob(job);
    await applyJob(job);
    return c.json({ ok: true, job });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

jobsApi.delete("/:name", async (c) => {
  const name = c.req.param("name");
  await unloadJob(name);
  const ok = await deleteJob(name);
  return c.json({ ok });
});

jobsApi.post("/:name/apply", async (c) => {
  const name = c.req.param("name");
  const job = await readJob(name);
  if (!job) return c.json({ error: "not found" }, 404);
  try {
    await applyJob(job);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

jobsApi.post("/orphans/:name/remove", async (c) => {
  const name = c.req.param("name");
  await unloadJob(name);
  return c.json({ ok: true });
});
