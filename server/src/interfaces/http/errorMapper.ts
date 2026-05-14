import os from "node:os";
import type { Context } from "hono";
import {
  NotFoundError,
  PickerCancelledError,
  SchedulerError,
  ValidationError,
} from "../../domain/errors.js";

const HOME = os.homedir();

// Strip the user's home directory from messages so the HTTP layer doesn't
// leak filesystem structure to clients.
function sanitize(msg: string): string {
  return HOME ? msg.split(HOME).join("~") : msg;
}

// Map domain errors to HTTP responses. Edge layer responsibility — domain
// itself never knows about HTTP.
export function handleError(c: Context, err: unknown) {
  if (err instanceof ValidationError) {
    return c.json({ error: sanitize(err.message) }, 400);
  }
  if (err instanceof NotFoundError) {
    return c.json({ error: sanitize(err.message) }, 404);
  }
  if (err instanceof PickerCancelledError) {
    return c.json({ ok: false, error: "cancelled" });
  }
  if (err instanceof SchedulerError) {
    return c.json({ ok: false, error: sanitize(err.message) }, 500);
  }
  const msg = err instanceof Error ? err.message : "unknown error";
  return c.json({ error: sanitize(msg) }, 500);
}
