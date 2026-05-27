import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { LaunchdOrphanScanner } from "./LaunchdOrphanScanner.js";
import {
  LABEL_PREFIX,
  LAUNCH_AGENTS_DIR,
  PLISTS_DIR,
  RUNNER,
  SERVICE_LABEL,
} from "../../config/paths.js";
import type { RunResult } from "../shell/processRunner.js";

type RunFn = (cmd: string, args: string[]) => Promise<RunResult>;
type FsOps = {
  readdir(dir: string): Promise<string[]>;
  readFile(filePath: string, enc: string): Promise<string>;
  unlink(filePath: string): Promise<void>;
};

// A runner that reports an empty launchctl list (one-line header only)
function emptyListRun(): RunFn {
  return () => Promise.resolve({ code: 0, stdout: "PID\tStatus\tLabel", stderr: "" });
}

// A runner that reports specific labels loaded in launchctl list
function listRun(labels: string[]): RunFn {
  const body = labels.map((l) => `- - ${l}`).join("\n");
  return () =>
    Promise.resolve({
      code: 0,
      stdout: `PID\tStatus\tLabel\n${body}`,
      stderr: "",
    });
}

// A runner that captures every call (for removeByLabel verification)
function captureRun(): { calls: [string, string[]][]; runner: RunFn } {
  const calls: [string, string[]][] = [];
  return {
    calls,
    runner: (cmd, args) => {
      calls.push([cmd, [...args]]);
      return Promise.resolve({ code: 0, stdout: "", stderr: "" });
    },
  };
}

// Plist content that looks like one of ours: RUNNER in ProgramArguments
// immediately followed by the job name
function ourPlistContent(jobName: string): string {
  return `<string>${RUNNER}</string>\n<string>${jobName}</string>`;
}

// Plist content where RUNNER appears but is not followed by a job name element
function ourPlistNoJobName(): string {
  return `<string>${RUNNER}</string>`;
}

// Plist content that does not reference RUNNER at all
function foreignPlistContent(): string {
  return "<string>/usr/bin/other-tool</string>";
}

// Full launchd label for a job name using the configured prefix
function lbl(jobName: string): string {
  return `${LABEL_PREFIX}.${jobName}`;
}

// Build an FsOps stub driven by in-memory maps
function makeFsOps(config: {
  agentsDir?: string[];
  localDir?: string[];
  fileContent?: Record<string, string>;
  unlinkErrors?: Record<string, NodeJS.ErrnoException>;
}): FsOps & { unlinked: string[] } {
  const unlinked: string[] = [];
  const { agentsDir = [], localDir = [], fileContent = {}, unlinkErrors = {} } = config;
  return {
    unlinked,
    async readdir(dirPath: string): Promise<string[]> {
      if (dirPath === LAUNCH_AGENTS_DIR) return agentsDir;
      if (dirPath === PLISTS_DIR) return localDir;
      throw Object.assign(new Error(`ENOENT: ${dirPath}`), { code: "ENOENT" });
    },
    async readFile(filePath: string): Promise<string> {
      return fileContent[filePath] ?? "";
    },
    async unlink(filePath: string): Promise<void> {
      const err = unlinkErrors[filePath];
      if (err) throw err;
      unlinked.push(filePath);
    },
  };
}

function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error("ENOENT: no such file or directory"), {
    code: "ENOENT",
  });
}

function eperm(): NodeJS.ErrnoException {
  return Object.assign(new Error("EPERM: operation not permitted"), {
    code: "EPERM",
  });
}

describe("LaunchdOrphanScanner.scan", () => {
  it("returns [] when both dirs are empty", async () => {
    const fsOps = makeFsOps({});
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("returns [] when readdir throws (dirs do not exist)", async () => {
    const fsOps: FsOps & { unlinked: string[] } = {
      unlinked: [],
      readdir: async () => {
        throw enoent();
      },
      readFile: async () => "",
      unlink: async () => {},
    };
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("ignores non-plist files in agentsDir", async () => {
    const fsOps = makeFsOps({ agentsDir: ["readme.txt", "photo.png"] });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("ignores plists whose content does not reference RUNNER", async () => {
    const filename = `${lbl("ghost")}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: foreignPlistContent() },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("returns an orphan for our plist found in agentsDir", async () => {
    const filename = `${lbl("old-job")}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: ourPlistContent("old-job") },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      name: "old-job",
      label: lbl("old-job"),
      loaded: false,
      inAgentsDir: true,
      inLocalPlists: false,
    });
  });

  it("returns an orphan for our plist found in localDir (plists/)", async () => {
    const filename = `${lbl("stale-job")}.plist`;
    const filePath = path.join(PLISTS_DIR, filename);
    const fsOps = makeFsOps({
      localDir: [filename],
      fileContent: { [filePath]: ourPlistContent("stale-job") },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      name: "stale-job",
      label: lbl("stale-job"),
      loaded: false,
      inAgentsDir: false,
      inLocalPlists: true,
    });
  });

  it("filters out job names present in knownJobNames", async () => {
    const filename = `${lbl("known-job")}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: ourPlistContent("known-job") },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set(["known-job"])), []);
  });

  it("skips SERVICE_LABEL plist in agentsDir", async () => {
    const filename = `${SERVICE_LABEL}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: ourPlistContent("service") },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("skips SERVICE_LABEL plist in localDir", async () => {
    const filename = `${SERVICE_LABEL}.plist`;
    const filePath = path.join(PLISTS_DIR, filename);
    const fsOps = makeFsOps({
      localDir: [filename],
      fileContent: { [filePath]: ourPlistContent("service") },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("sets loaded=true when label appears in launchctl list", async () => {
    const filename = `${lbl("running-job")}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: ourPlistContent("running-job") },
    });
    const scanner = new LaunchdOrphanScanner(listRun([lbl("running-job")]), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.equal(result[0].loaded, true);
  });

  it("sets inAgentsDir and inLocalPlists when label appears in both dirs", async () => {
    const filename = `${lbl("both-job")}.plist`;
    const agentPath = path.join(LAUNCH_AGENTS_DIR, filename);
    const localPath = path.join(PLISTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      localDir: [filename],
      fileContent: {
        [agentPath]: ourPlistContent("both-job"),
        [localPath]: ourPlistContent("both-job"),
      },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.equal(result[0].inAgentsDir, true);
    assert.equal(result[0].inLocalPlists, true);
    assert.equal(result[0].loaded, false);
  });

  it("detects a loaded-only orphan (in launchctl list but no plist file)", async () => {
    const fsOps = makeFsOps({});
    const orphanLabel = lbl("ghost-job");
    const scanner = new LaunchdOrphanScanner(listRun([orphanLabel]), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], {
      name: "ghost-job",
      label: orphanLabel,
      loaded: true,
      inAgentsDir: false,
      inLocalPlists: false,
    });
  });

  it("does not return loaded-only orphan when its name is in knownJobNames", async () => {
    const fsOps = makeFsOps({});
    const scanner = new LaunchdOrphanScanner(listRun([lbl("known")]), fsOps);
    assert.deepEqual(await scanner.scan(new Set(["known"])), []);
  });

  it("ignores loaded labels whose prefix does not match LABEL_PREFIX", async () => {
    const fsOps = makeFsOps({});
    const scanner = new LaunchdOrphanScanner(
      listRun(["com.apple.some-service", "homebrew.mxcl.redis"]),
      fsOps,
    );
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("falls back to label as name when RUNNER is present but job name cannot be extracted", async () => {
    const filename = `${lbl("unnamed-job")}.plist`;
    const filePath = path.join(LAUNCH_AGENTS_DIR, filename);
    const fsOps = makeFsOps({
      agentsDir: [filename],
      fileContent: { [filePath]: ourPlistNoJobName() },
    });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 1);
    assert.equal(result[0].name, lbl("unnamed-job"));
    assert.equal(result[0].label, lbl("unnamed-job"));
  });

  it("returns orphans sorted lexicographically by label", async () => {
    const names = ["zzz-job", "aaa-job", "mmm-job"];
    const agentsDir: string[] = [];
    const fileContent: Record<string, string> = {};
    for (const name of names) {
      const filename = `${lbl(name)}.plist`;
      agentsDir.push(filename);
      fileContent[path.join(LAUNCH_AGENTS_DIR, filename)] = ourPlistContent(name);
    }
    const fsOps = makeFsOps({ agentsDir, fileContent });
    const scanner = new LaunchdOrphanScanner(emptyListRun(), fsOps);
    const result = await scanner.scan(new Set());
    assert.equal(result.length, 3);
    assert.equal(result[0].name, "aaa-job");
    assert.equal(result[1].name, "mmm-job");
    assert.equal(result[2].name, "zzz-job");
  });

  it("ignores SERVICE_LABEL when it appears in launchctl list", async () => {
    const fsOps = makeFsOps({});
    const scanner = new LaunchdOrphanScanner(listRun([SERVICE_LABEL]), fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });

  it("returns empty set when launchctl exits non-zero", async () => {
    const fsOps = makeFsOps({});
    const runner: RunFn = () =>
      Promise.resolve({ code: 1, stdout: "", stderr: "error" });
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    assert.deepEqual(await scanner.scan(new Set()), []);
  });
});

describe("LaunchdOrphanScanner.removeByLabel", () => {
  it("calls launchctl bootout twice and unlinks both plist files", async () => {
    const { calls, runner } = captureRun();
    const fsOps = makeFsOps({});
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    const testLabel = lbl("old-job");
    await scanner.removeByLabel(testLabel);

    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "launchctl");
    assert.equal(calls[0][1][0], "bootout");
    assert.ok(calls[0][1].some((a) => a.includes(testLabel)));
    assert.equal(calls[1][0], "launchctl");
    assert.equal(calls[1][1][0], "bootout");

    const linked = path.join(LAUNCH_AGENTS_DIR, `${testLabel}.plist`);
    const local = path.join(PLISTS_DIR, `${testLabel}.plist`);
    assert.ok(fsOps.unlinked.includes(linked));
    assert.ok(fsOps.unlinked.includes(local));
  });

  it("does not throw when linked plist unlink raises ENOENT", async () => {
    const { runner } = captureRun();
    const testLabel = lbl("gone-job");
    const linked = path.join(LAUNCH_AGENTS_DIR, `${testLabel}.plist`);
    const fsOps = makeFsOps({ unlinkErrors: { [linked]: enoent() } });
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    await assert.doesNotReject(() => scanner.removeByLabel(testLabel));
  });

  it("does not throw when local plist unlink raises ENOENT", async () => {
    const { runner } = captureRun();
    const testLabel = lbl("gone-job");
    const local = path.join(PLISTS_DIR, `${testLabel}.plist`);
    const fsOps = makeFsOps({ unlinkErrors: { [local]: enoent() } });
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    await assert.doesNotReject(() => scanner.removeByLabel(testLabel));
  });

  it("rethrows non-ENOENT errors from linked plist unlink", async () => {
    const { runner } = captureRun();
    const testLabel = lbl("perm-job");
    const linked = path.join(LAUNCH_AGENTS_DIR, `${testLabel}.plist`);
    const fsOps = makeFsOps({ unlinkErrors: { [linked]: eperm() } });
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    await assert.rejects(() => scanner.removeByLabel(testLabel), /EPERM/);
  });

  it("rethrows non-ENOENT errors from local plist unlink", async () => {
    const { runner } = captureRun();
    const testLabel = lbl("perm-job");
    const local = path.join(PLISTS_DIR, `${testLabel}.plist`);
    const fsOps = makeFsOps({ unlinkErrors: { [local]: eperm() } });
    const scanner = new LaunchdOrphanScanner(runner, fsOps);
    await assert.rejects(() => scanner.removeByLabel(testLabel), /EPERM/);
  });
});
