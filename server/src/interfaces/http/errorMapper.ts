import type { Context } from "hono";
import {
  NotFoundError,
  PickerCancelledError,
  SchedulerError,
  ValidationError,
} from "../../domain/errors.js";

// Map domain errors to HTTP responses. Edge layer responsibility — domain
// itself never knows about HTTP.
export function handleError(c: Context, err: unknown) {
  if (err instanceof ValidationError) {
    return c.json({ error: err.message }, 400);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof PickerCancelledError) {
    return c.json({ ok: false, error: "cancelled" });
  }
  if (err instanceof SchedulerError) {
    return c.json({ ok: false, error: err.message }, 500);
  }
  const msg = err instanceof Error ? err.message : "unknown error";
  return c.json({ error: msg }, 500);
}
