import { Hono } from "hono";
import { JobName } from "../../../domain/job/JobName.js";
import type { Composition } from "../../../composition.js";
import { handleError } from "../errorMapper.js";
import { jobToDto, jobWithStatusToDto } from "../dto.js";

export function jobsRoutes(c: Composition) {
  const app = new Hono();

  app.get("/", async (ctx) => {
    try {
      const { jobs, orphans } = await c.useCases.listJobs();
      return ctx.json({
        jobs: jobs.map(({ job, status }) => jobWithStatusToDto(job, status)),
        orphans,
      });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.get("/:name", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      const { job, status } = await c.useCases.getJob(name);
      return ctx.json({ job: jobToDto(job), status });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.put("/:name", async (ctx) => {
    try {
      const nameParam = ctx.req.param("name");
      const body = await ctx.req.json();
      const job = await c.useCases.saveJob({ ...body, name: nameParam });
      return ctx.json({ ok: true, job: jobToDto(job) });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.delete("/:name", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      const ok = await c.useCases.deleteJob(name);
      return ctx.json({ ok });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.post("/:name/apply", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      await c.useCases.applyJob(name);
      return ctx.json({ ok: true });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.post("/orphans/remove", async (ctx) => {
    try {
      const body = (await ctx.req.json().catch(() => ({}))) as {
        label?: unknown;
      };
      const label = typeof body.label === "string" ? body.label : "";
      await c.useCases.removeOrphan(label);
      return ctx.json({ ok: true });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  return app;
}
