import { Hono } from "hono";
import fs from "node:fs/promises";
import path from "node:path";
import { jobLogsDirFor } from "../lib/paths.js";

export const logsApi = new Hono();

logsApi.get("/:name", async (c) => {
  const name = c.req.param("name");
  const dir = jobLogsDirFor(name);
  try {
    const files = await fs.readdir(dir);
    const entries = await Promise.all(
      files
        .filter((f) => f.endsWith(".log"))
        .map(async (f) => {
          const stat = await fs.stat(path.join(dir, f));
          return { file: f, size: stat.size, mtime: stat.mtime.toISOString() };
        }),
    );
    entries.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return c.json({ files: entries });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({ files: [] });
    }
    throw err;
  }
});

logsApi.get("/:name/:file", async (c) => {
  const name = c.req.param("name");
  const file = c.req.param("file");
  if (file.includes("/") || file.includes("..")) {
    return c.json({ error: "invalid filename" }, 400);
  }
  const tailParam = c.req.query("tail");
  const tailBytes = tailParam ? Math.max(1, Math.min(1_000_000, Number(tailParam))) : undefined;

  const fullPath = path.join(jobLogsDirFor(name), file);
  try {
    if (tailBytes !== undefined) {
      const stat = await fs.stat(fullPath);
      const start = Math.max(0, stat.size - tailBytes);
      const fh = await fs.open(fullPath, "r");
      try {
        const buf = Buffer.alloc(stat.size - start);
        await fh.read(buf, 0, buf.length, start);
        return c.text(buf.toString("utf8"));
      } finally {
        await fh.close();
      }
    }
    const content = await fs.readFile(fullPath, "utf8");
    return c.text(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return c.json({ error: "not found" }, 404);
    }
    throw err;
  }
});
