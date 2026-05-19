import fs from "node:fs/promises";
import os from "node:os";
import { SchedulerError } from "../../domain/errors.js";
import type { Job } from "../../domain/job/Job.js";
import type { JobName } from "../../domain/job/JobName.js";
import type { JobStatus, Scheduler } from "../../domain/scheduler/Scheduler.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  generatedPlistPath,
  jobLogsDir,
  labelFor,
  linkedPlistPath,
} from "../../config/paths.js";
import { run } from "../shell/processRunner.js";
import type { RunResult } from "../shell/processRunner.js";
import type { PlistBuilder } from "./PlistBuilder.js";

type RunFn = (cmd: string, args: string[]) => Promise<RunResult>;

export type FsOps = {
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>;
  writeFile(path: string, content: string, encoding: BufferEncoding): Promise<void>;
  unlink(path: string): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
};

function uid(): number {
  return os.userInfo().uid;
}

function gui(): string {
  return `gui/${uid()}`;
}

export class LaunchdScheduler implements Scheduler {
  private readonly runner: RunFn;
  private readonly fsOps: FsOps;

  constructor(
    private readonly plistBuilder: PlistBuilder,
    runner?: RunFn,
    fsOps?: FsOps,
  ) {
    this.runner = runner ?? run;
    this.fsOps = fsOps ?? {
      mkdir: async (p, opts) => {
        await fs.mkdir(p, opts);
      },
      writeFile: (p, content, enc) => fs.writeFile(p, content, enc),
      unlink: (p) => fs.unlink(p),
      symlink: (target, p) => fs.symlink(target, p),
    };
  }

  async apply(job: Job): Promise<void> {
    await this.fsOps.mkdir(PLISTS_DIR, { recursive: true });
    await this.fsOps.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
    await this.fsOps.mkdir(jobLogsDir(job.name.value), { recursive: true });

    const generated = generatedPlistPath(job.name.value);
    await this.fsOps.writeFile(generated, this.plistBuilder.build(job), "utf8");

    const linked = linkedPlistPath(job.name.value);
    try {
      await this.fsOps.unlink(linked);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    await this.fsOps.symlink(generated, linked);

    await this.runner("launchctl", ["bootout", gui(), linked]);
    if (job.enabled) {
      const r = await this.runner("launchctl", ["bootstrap", gui(), linked]);
      if (r.code !== 0) {
        throw new SchedulerError(`launchctl bootstrap failed: ${r.stderr.trim()}`);
      }
    }
  }

  async unload(name: JobName): Promise<void> {
    const linked = linkedPlistPath(name.value);
    await this.runner("launchctl", ["bootout", gui(), linked]);
    try {
      await this.fsOps.unlink(linked);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    try {
      await this.fsOps.unlink(generatedPlistPath(name.value));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async kickstart(name: JobName): Promise<void> {
    const r = await this.runner("launchctl", [
      "kickstart",
      `${gui()}/${labelFor(name.value)}`,
    ]);
    if (r.code !== 0) {
      throw new SchedulerError(r.stderr.trim() || "kickstart failed");
    }
  }

  async statuses(): Promise<Map<string, JobStatus>> {
    const r = await this.runner("launchctl", ["list"]);
    const out = new Map<string, JobStatus>();
    if (r.code !== 0) return out;
    const lines = r.stdout.split("\n").slice(1);
    for (const line of lines) {
      if (!line.trim()) continue;
      const [pidStr, statusStr, label] = line.split(/\s+/);
      if (!label || !label.startsWith(LABEL_PREFIX + ".")) continue;
      const name = label.slice(LABEL_PREFIX.length + 1);
      const pid = pidStr === "-" ? undefined : Number(pidStr);
      const lastExitStatus = statusStr === "-" ? undefined : Number(statusStr);
      out.set(name, { loaded: true, pid, lastExitStatus });
    }
    return out;
  }
}
