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
  plistPath: string,
): Promise<{ ours: boolean; jobName: string | null }> {
  try {
    const content = await fs.readFile(plistPath, "utf8");
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

async function listAllLoadedLabels(): Promise<Set<string>> {
  const r = await run("launchctl", ["list"]);
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
      const files = await fs.readdir(LAUNCH_AGENTS_DIR);
      for (const f of files) {
        if (!f.endsWith(".plist")) continue;
        const label = path.basename(f, ".plist");
        if (label === SERVICE_LABEL) continue;
        const { ours, jobName } = await inspectPlist(
          path.join(LAUNCH_AGENTS_DIR, f),
        );
        if (ours) record(label, jobName, "agents");
      }
    } catch {
      // ignore
    }

    // plists/ — stale generated files
    try {
      const files = await fs.readdir(PLISTS_DIR);
      for (const f of files) {
        if (!f.endsWith(".plist")) continue;
        const label = path.basename(f, ".plist");
        if (label === SERVICE_LABEL) continue;
        const { ours, jobName } = await inspectPlist(path.join(PLISTS_DIR, f));
        if (ours) record(label, jobName, "local");
      }
    } catch {
      // ignore
    }

    // Mark loaded state. Also catch loaded entries with no plist file (rare).
    const loadedLabels = await listAllLoadedLabels();
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
}
