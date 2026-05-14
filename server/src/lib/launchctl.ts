import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPlist } from "./plist.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  jobLogsDirFor,
  labelFor,
  linkedPlistPathFor,
  plistPathFor,
} from "./paths.js";
import type { Job, JobStatus } from "./types.js";

function uid(): number {
  return os.userInfo().uid;
}

function gui(): string {
  return `gui/${uid()}`;
}

type RunResult = { code: number; stdout: string; stderr: string };

function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) =>
      resolve({ code: code ?? -1, stdout, stderr }),
    );
    child.on("error", (err) =>
      resolve({ code: -1, stdout, stderr: stderr + err.message }),
    );
  });
}

export async function applyJob(job: Job): Promise<void> {
  await fs.mkdir(PLISTS_DIR, { recursive: true });
  await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });
  await fs.mkdir(jobLogsDirFor(job.name), { recursive: true });

  const plistContent = buildPlist(job);
  const generated = plistPathFor(job.name);
  await fs.writeFile(generated, plistContent, "utf8");

  const linked = linkedPlistPathFor(job.name);
  // Refresh symlink in ~/Library/LaunchAgents
  try {
    await fs.unlink(linked);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await fs.symlink(generated, linked);

  // Unload first if already loaded, then load
  await run("launchctl", ["bootout", gui(), linked]);
  if (job.enabled) {
    const r = await run("launchctl", ["bootstrap", gui(), linked]);
    if (r.code !== 0) {
      throw new Error(`launchctl bootstrap failed: ${r.stderr.trim()}`);
    }
  }
}

export async function unloadJob(name: string): Promise<void> {
  const linked = linkedPlistPathFor(name);
  await run("launchctl", ["bootout", gui(), linked]);
  try {
    await fs.unlink(linked);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  try {
    await fs.unlink(plistPathFor(name));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function kickstart(name: string): Promise<RunResult> {
  return run("launchctl", ["kickstart", `${gui()}/${labelFor(name)}`]);
}

export async function listLoaded(): Promise<Map<string, JobStatus>> {
  const r = await run("launchctl", ["list"]);
  const out = new Map<string, JobStatus>();
  if (r.code !== 0) return out;
  const lines = r.stdout.split("\n").slice(1); // skip header
  for (const line of lines) {
    if (!line.trim()) continue;
    const [pidStr, statusStr, label] = line.split(/\s+/);
    if (!label || !label.startsWith(LABEL_PREFIX + ".")) continue;
    const name = label.slice(LABEL_PREFIX.length + 1);
    const pid = pidStr === "-" ? undefined : Number(pidStr);
    const lastExitStatus = statusStr === "-" ? undefined : Number(statusStr);
    out.set(name, { name, loaded: true, pid, lastExitStatus });
  }
  return out;
}

export async function listOrphans(knownJobNames: Set<string>): Promise<string[]> {
  // Anything loaded under our prefix that isn't in jobs/ is an orphan.
  const loaded = await listLoaded();
  const orphans: string[] = [];
  for (const name of loaded.keys()) {
    if (!knownJobNames.has(name)) orphans.push(name);
  }
  // Also stale plists on disk that aren't in jobs/
  try {
    const files = await fs.readdir(PLISTS_DIR);
    for (const f of files) {
      if (!f.endsWith(".plist")) continue;
      const label = path.basename(f, ".plist");
      if (!label.startsWith(LABEL_PREFIX + ".")) continue;
      const name = label.slice(LABEL_PREFIX.length + 1);
      if (!knownJobNames.has(name) && !orphans.includes(name)) {
        orphans.push(name);
      }
    }
  } catch {
    // ignore
  }
  return orphans;
}
