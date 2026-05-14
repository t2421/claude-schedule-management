import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildPlist } from "./plist.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  RUNNER,
  SERVICE_LABEL,
  jobLogsDirFor,
  labelFor,
  linkedPlistPathFor,
  plistPathFor,
} from "./paths.js";
import type { Job, JobStatus, Orphan } from "./types.js";

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
  try {
    await fs.unlink(linked);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await fs.symlink(generated, linked);

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

// Read all labels currently loaded for this user (not filtered by prefix).
async function listAllLoadedLabels(): Promise<Set<string>> {
  const r = await run("launchctl", ["list"]);
  const labels = new Set<string>();
  if (r.code !== 0) return labels;
  const lines = r.stdout.split("\n").slice(1);
  for (const line of lines) {
    const cols = line.split(/\s+/);
    const label = cols[2];
    if (label) labels.add(label);
  }
  return labels;
}

// Inspect a plist file and decide if it's one our tool generated.
// Detection key: ProgramArguments[0] equals the absolute path to our runner.sh.
async function inspectPlist(
  plistPath: string,
): Promise<{ ours: boolean; jobName: string | null }> {
  try {
    const content = await fs.readFile(plistPath, "utf8");
    if (!content.includes(RUNNER)) return { ours: false, jobName: null };
    // Extract job name: the <string> immediately following the runner path inside
    // ProgramArguments. Plists are XML; a light regex is enough here.
    const escRunner = RUNNER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = content.match(
      new RegExp(`<string>${escRunner}</string>\\s*<string>([^<]+)</string>`),
    );
    return { ours: true, jobName: m?.[1] ?? null };
  } catch {
    return { ours: false, jobName: null };
  }
}

export async function listOrphans(
  knownJobNames: Set<string>,
): Promise<Orphan[]> {
  const byLabel = new Map<string, Orphan>();

  const recordOrphan = (
    label: string,
    jobName: string | null,
    where: "agents" | "local",
  ) => {
    if (label === SERVICE_LABEL) return;
    const name = jobName ?? label;
    if (knownJobNames.has(name)) return;
    const existing = byLabel.get(label);
    if (existing) {
      if (where === "agents") existing.inAgentsDir = true;
      if (where === "local") existing.inLocalPlists = true;
      return;
    }
    byLabel.set(label, {
      name,
      label,
      loaded: false,
      inAgentsDir: where === "agents",
      inLocalPlists: where === "local",
    });
  };

  // 1. Scan ~/Library/LaunchAgents for plist files referencing our runner.
  try {
    const files = await fs.readdir(LAUNCH_AGENTS_DIR);
    for (const f of files) {
      if (!f.endsWith(".plist")) continue;
      const label = path.basename(f, ".plist");
      if (label === SERVICE_LABEL) continue;
      const { ours, jobName } = await inspectPlist(path.join(LAUNCH_AGENTS_DIR, f));
      if (ours) recordOrphan(label, jobName, "agents");
    }
  } catch {
    // ignore (missing dir)
  }

  // 2. Scan our generated plists/ directory for stale files.
  try {
    const files = await fs.readdir(PLISTS_DIR);
    for (const f of files) {
      if (!f.endsWith(".plist")) continue;
      const label = path.basename(f, ".plist");
      if (label === SERVICE_LABEL) continue;
      const { ours, jobName } = await inspectPlist(path.join(PLISTS_DIR, f));
      if (ours) recordOrphan(label, jobName, "local");
    }
  } catch {
    // ignore
  }

  // 3. Mark loaded status from launchctl. Also catch loaded entries that have
  //    no plist file on disk (rare, but possible if the user deleted the file).
  const loadedLabels = await listAllLoadedLabels();
  for (const label of loadedLabels) {
    if (label === SERVICE_LABEL) continue;
    const existing = byLabel.get(label);
    if (existing) {
      existing.loaded = true;
      continue;
    }
    // Not in either plist dir but loaded. Only consider it ours if the label
    // matches the current prefix (best effort — we can't read the plist now).
    if (label.startsWith(LABEL_PREFIX + ".")) {
      const name = label.slice(LABEL_PREFIX.length + 1);
      if (!knownJobNames.has(name)) {
        byLabel.set(label, {
          name,
          label,
          loaded: true,
          inAgentsDir: false,
          inLocalPlists: false,
        });
      }
    }
  }

  return Array.from(byLabel.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

// Remove an orphan by its full launchd label. Works regardless of which prefix
// it was created under.
export async function removeOrphanByLabel(label: string): Promise<void> {
  const linked = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
  const local = path.join(PLISTS_DIR, `${label}.plist`);
  await run("launchctl", ["bootout", `${gui()}/${label}`]);
  await run("launchctl", ["bootout", gui(), linked]);
  try {
    await fs.unlink(linked);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  try {
    await fs.unlink(local);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
