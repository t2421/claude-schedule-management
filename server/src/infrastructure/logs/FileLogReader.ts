import fs from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "../../domain/errors.js";
import type { JobName } from "../../domain/job/JobName.js";
import type { LogFile, LogReader } from "../../domain/logs/LogReader.js";
import { jobLogsDir } from "../../config/paths.js";

export class FileLogReader implements LogReader {
  async list(jobName: JobName): Promise<LogFile[]> {
    const dir = jobLogsDir(jobName.value);
    try {
      const files = await fs.readdir(dir);
      const entries = await Promise.all(
        files
          .filter((f) => f.endsWith(".log"))
          .map(async (f) => {
            const stat = await fs.stat(path.join(dir, f));
            return {
              file: f,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
            };
          }),
      );
      return entries.sort((a, b) => b.mtime.localeCompare(a.mtime));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async read(jobName: JobName, file: string, tailBytes?: number): Promise<string> {
    if (file.includes("/") || file.includes("..")) {
      throw new ValidationError("invalid filename");
    }
    const fullPath = path.join(jobLogsDir(jobName.value), file);

    if (tailBytes !== undefined) {
      // NaN / Infinity / negatives / floats would either crash Buffer.alloc()
      // or silently produce surprising results. Reject at the I/O boundary so
      // callers see a clean ValidationError (mapped to HTTP 400 by the route
      // layer) instead of a 500 with an opaque RangeError.
      if (!Number.isInteger(tailBytes) || tailBytes <= 0) {
        throw new ValidationError("tail must be a positive integer");
      }
      const tail = Math.min(1_000_000, tailBytes);
      const stat = await fs.stat(fullPath);
      const start = Math.max(0, stat.size - tail);
      const fh = await fs.open(fullPath, "r");
      try {
        const buf = Buffer.alloc(stat.size - start);
        await fh.read(buf, 0, buf.length, start);
        return buf.toString("utf8");
      } finally {
        await fh.close();
      }
    }
    return fs.readFile(fullPath, "utf8");
  }
}
