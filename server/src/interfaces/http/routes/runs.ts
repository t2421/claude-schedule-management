import { Hono } from "hono";
import { JobName } from "../../../domain/job/JobName.js";
import type { Composition } from "../../../composition.js";
import { handleError } from "../errorMapper.js";

export function runsRoutes(c: Composition) {
  const app = new Hono();

  app.post("/:name/kickstart", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      await c.useCases.kickstartJob(name);
      return ctx.json({ ok: true });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  return app;
}
