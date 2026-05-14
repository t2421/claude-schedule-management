import { Hono } from "hono";
import { spawn } from "node:child_process";

export const pickerApi = new Hono();

// Opens a native macOS folder picker via AppleScript.
// Returns { ok: true, path } on selection, { ok: false, error: 'cancelled' } when dismissed.
pickerApi.post("/folder", async (c) => {
  const result = await new Promise<{ ok: boolean; path?: string; error?: string }>(
    (resolve) => {
      const script = `POSIX path of (choose folder with prompt "Working directory")`;
      const child = spawn("osascript", ["-e", script]);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code === 0) {
          resolve({ ok: true, path: stdout.trim() });
        } else if (/canceled|cancelled/i.test(stderr)) {
          resolve({ ok: false, error: "cancelled" });
        } else {
          resolve({ ok: false, error: stderr.trim() || `osascript exit ${code}` });
        }
      });
      child.on("error", (err) => resolve({ ok: false, error: err.message }));
    },
  );
  return c.json(result);
});
