import { Hono } from "hono";
import { PickerCancelledError } from "../../../domain/errors.js";
import type { Composition } from "../../../composition.js";
import { handleError } from "../errorMapper.js";

export function pickerRoutes(c: Composition) {
  const app = new Hono();

  app.post("/folder", async (ctx) => {
    try {
      const p = await c.useCases.pickFolder();
      return ctx.json({ ok: true, path: p });
    } catch (err) {
      if (err instanceof PickerCancelledError) {
        return ctx.json({ ok: false, error: "cancelled" });
      }
      return handleError(ctx, err);
    }
  });

  return app;
}
