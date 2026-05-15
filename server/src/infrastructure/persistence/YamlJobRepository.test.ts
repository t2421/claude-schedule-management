import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { YamlJobRepository } from "./YamlJobRepository.js";
import { Job } from "../../domain/job/Job.js";
import { JobName } from "../../domain/job/JobName.js";

const baseProps = {
  name: "alpha",
  schedule: { cron: "0 9 * * *" },
  prompt: "do the thing",
  enabled: true,
  working_directory: "/Users/x/proj",
};

describe("YamlJobRepository", () => {
  let dir: string;
  let repo: YamlJobRepository;

  before(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "yaml-job-repo-"));
  });

  after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Wipe the directory contents between tests so state doesn't leak.
    const entries = await fs.readdir(dir).catch(() => []);
    await Promise.all(
      entries.map((f) => fs.rm(path.join(dir, f), { recursive: true, force: true })),
    );
    repo = new YamlJobRepository(dir);
  });

  describe("list", () => {
    it("creates the directory if it does not yet exist", async () => {
      const missing = path.join(dir, "nested-fresh");
      const freshRepo = new YamlJobRepository(missing);
      const jobs = await freshRepo.list();
      assert.deepEqual(jobs, []);
      const stat = await fs.stat(missing);
      assert.ok(stat.isDirectory());
    });

    it("returns an empty array when the directory has no yaml files", async () => {
      await fs.writeFile(path.join(dir, "readme.txt"), "ignored", "utf8");
      const jobs = await repo.list();
      assert.deepEqual(jobs, []);
    });

    it("returns jobs sorted by name and includes both .yaml and .yml", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "zebra", prompt: "z" }));
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha", prompt: "a" }));
      // Hand-write a .yml file (the save method always uses .yaml).
      const ymlPath = path.join(dir, "middle.yml");
      const ymlJob = Job.fromPlain({
        ...baseProps,
        name: "middle",
        prompt: "m",
      });
      await fs.writeFile(ymlPath, YAML.stringify(ymlJob.toPlain()), "utf8");

      const jobs = await repo.list();
      assert.deepEqual(
        jobs.map((j) => j.name.value),
        ["alpha", "middle", "zebra"],
      );
    });

    it("skips invalid yaml files without failing the whole list", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "good" }));
      await fs.writeFile(
        path.join(dir, "broken.yaml"),
        "this: : is :: invalid\n  - [\n",
        "utf8",
      );
      // Valid YAML but invalid Job (missing required prompt) — should also
      // be skipped, not crash the listing.
      await fs.writeFile(
        path.join(dir, "incomplete.yaml"),
        YAML.stringify({ name: "incomplete" }),
        "utf8",
      );

      const jobs = await repo.list();
      assert.deepEqual(
        jobs.map((j) => j.name.value),
        ["good"],
      );
    });

    it("ignores non-yaml files in the directory", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha" }));
      await fs.writeFile(path.join(dir, "alpha.json"), "{}", "utf8");
      await fs.writeFile(path.join(dir, ".DS_Store"), "noise", "utf8");

      const jobs = await repo.list();
      assert.deepEqual(
        jobs.map((j) => j.name.value),
        ["alpha"],
      );
    });
  });

  describe("find", () => {
    it("returns null when the job does not exist", async () => {
      const result = await repo.find(JobName.parse("missing"));
      assert.equal(result, null);
    });

    it("returns the saved job when present", async () => {
      const job = Job.fromPlain({ ...baseProps, name: "alpha" });
      await repo.save(job);
      const found = await repo.find(JobName.parse("alpha"));
      assert.ok(found);
      assert.equal(found!.name.value, "alpha");
      assert.equal(found!.prompt, "do the thing");
    });

    it("rethrows non-ENOENT errors (e.g. invalid yaml content)", async () => {
      // Write valid YAML that fails Job.fromPlain (missing required prompt field).
      await fs.writeFile(
        path.join(dir, "alpha.yaml"),
        YAML.stringify({ name: "alpha" }),
        "utf8",
      );
      await assert.rejects(() => repo.find(JobName.parse("alpha")));
    });
  });

  describe("save / find roundtrip", () => {
    it("preserves all fields including env, claude_args, and timeout", async () => {
      const original = Job.fromPlain({
        ...baseProps,
        name: "with-extras",
        description: "a job with all the trimmings",
        enabled: false,
        schedule: { cron: "*/15 * * * 1-5" },
        working_directory: "/tmp/work",
        claude_args: ["-p", "--dangerously-skip-permissions"],
        env: { FOO: "bar", PATH_EXTRA: "/opt/bin" },
        timeout_seconds: 600,
      });
      await repo.save(original);

      const loaded = await repo.find(JobName.parse("with-extras"));
      assert.ok(loaded);
      assert.equal(loaded!.description, "a job with all the trimmings");
      assert.equal(loaded!.enabled, false);
      assert.equal(loaded!.schedule.expression, "*/15 * * * 1-5");
      assert.equal(loaded!.workingDirectory, "/tmp/work");
      assert.deepEqual(loaded!.claudeArgs, ["-p", "--dangerously-skip-permissions"]);
      assert.deepEqual(loaded!.env, { FOO: "bar", PATH_EXTRA: "/opt/bin" });
      assert.equal(loaded!.timeoutSeconds, 600);
    });

    it("overwrites an existing job on save", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha", prompt: "v1" }));
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha", prompt: "v2" }));
      const loaded = await repo.find(JobName.parse("alpha"));
      assert.equal(loaded!.prompt, "v2");
    });

    it("writes to a path scoped to the configured directory", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha" }));
      const stat = await fs.stat(path.join(dir, "alpha.yaml"));
      assert.ok(stat.isFile());
    });
  });

  describe("delete", () => {
    it("returns true when a job was removed", async () => {
      await repo.save(Job.fromPlain({ ...baseProps, name: "alpha" }));
      const removed = await repo.delete(JobName.parse("alpha"));
      assert.equal(removed, true);
      assert.equal(await repo.find(JobName.parse("alpha")), null);
    });

    it("returns false when the job did not exist", async () => {
      const removed = await repo.delete(JobName.parse("missing"));
      assert.equal(removed, false);
    });

    it("does not touch .yml-suffixed siblings", async () => {
      // save() always writes .yaml; delete() should only unlink .yaml.
      const ymlPath = path.join(dir, "alpha.yml");
      const ymlJob = Job.fromPlain({ ...baseProps, name: "alpha" });
      await fs.writeFile(ymlPath, YAML.stringify(ymlJob.toPlain()), "utf8");

      const removed = await repo.delete(JobName.parse("alpha"));
      assert.equal(removed, false);
      // The .yml file is untouched.
      const stat = await fs.stat(ymlPath);
      assert.ok(stat.isFile());
    });

    it("rethrows non-ENOENT errors", async () => {
      // A directory at the expected path makes fs.unlink throw EPERM/EISDIR,
      // neither of which has code === "ENOENT", so the error must propagate.
      await fs.mkdir(path.join(dir, "alpha.yaml"));
      await assert.rejects(() => repo.delete(JobName.parse("alpha")));
    });
  });
});
