import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Orphan } from "../../domain/scheduler/Orphan.js";
import type { OrphanScanner } from "../../domain/scheduler/OrphanScanner.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  RUNNER,
  SERVICE_LABEL,
} from "../../config/paths.js";
import { run } from "../shell/processRunner.js";
import type { RunResult } from "../shell/processRunner.js";

type RunFn = (cmd: string, args: string[]) => Promise<RunResult>;

type FsOps = {
  readdir(path: string): Promise<string[]>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  unlink(path: string): Promise<void>;
};

function uid(): number {
  return os.userInfo().uid;
}

function gui(): string {
  return `gui/${uid()}`;
}

// Identify orphans by inspecting plist contents — does ProgramArguments[0]
// equal our runner? This is prefix-agnostic, so artifacts left over from a
// previous label scheme are detected too.
async function inspectPlist(
  fsOps: FsOps,
  plistPath: string,
): Promise<{ ours: boolean; jobName: string | null }> {
  try {
    const content = await fsOps.readFile(plistPath, "utf8");
    if (!content.includes(RUNNER)) return { ours: false, jobName: null };
    const escRunner = RUNNER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = content.match(
      new RegExp(`<string>${escRunner}</string>\\s*<string>([^<]+)</string>`),
    );
    return { ours: true, jobName: m?.[1] ?? null };
  } catch {
    return { ours: false, jobName: null };
  }
}

async function listAllLoadedLabels(runner: RunFn): Promise<Set<string>> {
  const r = await runner("launchctl", ["list"]);
  const labels = new Set<string>();
  if (r.code !== 0) return labels;
  for (const line of r.stdout.split("\n").slice(1)) {
    const cols = line.split(/\s+/);
    const label = cols[2];
    if (label) labels.add(label);
  }
  return labels;
}

export class LaunchdOrphanScanner implements OrphanScanner {
  private readonly runner: RunFn;
  private readonly fsOps: FsOps;

  constructor(runner?: RunFn, fsOps?: FsOps) {
    this.runner = runner ?? run;
    this.fsOps = fsOps ?? {
      readdir: (p) => fs.readdir(p),
      readFile: (p, enc) => fs.readFile(p, enc),
      unlink: (p) => fs.unlink(p),
    };
  }

  async scan(knownJobNames: Set<string>): Promise<Orphan[]> {
    const byLabel = new Map<string, Orphan>();

    const record = (
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

    // ~/Library/LaunchAgents/ — anything ours
    try {
      const files = await this.fsOps.readdir(LAUNCH_AGENTS_DIR);
      for (const f of files) {
        if (!f.endsWith(".plist")) continue;
        const label = path.basename(f, ".plist");
        if (label === SERVICE_LABEL) continue;
        const { ours, jobName } = await inspectPlist(
          this.fsOps,
          path.join(LAUNCH_AGENTS_DIR, f),
        );
        if (ours) record(label, jobName, "agents");
      }
    } catch {
      // ignore
    }

    // plists/ — stale generated files
    try {
      const files = await this.fsOps.readdir(PLISTS_DIR);
      for (const f of files) {
        if (!f.endsWith(".plist")) continue;
        const label = path.basename(f, ".plist");
        if (label === SERVICE_LABEL) continue;
        const { ours, jobName } = await inspectPlist(
          this.fsOps,
          path.join(PLISTS_DIR, f),
        );
        if (ours) record(label, jobName, "local");
      }
    } catch {
      // ignore
    }

    // Mark loaded state. Also catch loaded entries with no plist file (rare).
    const loadedLabels = await listAllLoadedLabels(this.runner);
    for (const label of loadedLabels) {
      if (label === SERVICE_LABEL) continue;
      const existing = byLabel.get(label);
      if (existing) {
        existing.loaded = true;
        continue;
      }
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

  async removeByLabel(label: string): Promise<void> {
    const linked = path.join(LAUNCH_AGENTS_DIR, `${label}.plist`);
    const local = path.join(PLISTS_DIR, `${label}.plist`);
    await this.runner("launchctl", ["bootout", `${gui()}/${label}`]);
    await this.runner("launchctl", ["bootout", gui(), linked]);
    try {
      await this.fsOps.unlink(linked);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    try {
      await this.fsOps.unlink(local);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
