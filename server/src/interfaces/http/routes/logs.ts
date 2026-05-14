import { Hono } from "hono";
import { JobName } from "../../../domain/job/JobName.js";
import type { Composition } from "../../../composition.js";
import { handleError } from "../errorMapper.js";

export function logsRoutes(c: Composition) {
  const app = new Hono();

  app.get("/:name", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      const files = await c.useCases.listLogs(name);
      return ctx.json({ files });
    } catch (err) {
      return handleError(ctx, err);
    }
  });

  app.get("/:name/:file", async (ctx) => {
    try {
      const name = JobName.parse(ctx.req.param("name"));
      const file = ctx.req.param("file");
      const tailParam = ctx.req.query("tail");
      const tailBytes = tailParam ? Number(tailParam) : undefined;
      const content = await c.useCases.readLog(name, file, tailBytes);
      return ctx.text(content);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return ctx.json({ error: "not found" }, 404);
      return handleError(ctx, err);
    }
  });

  return app;
}
