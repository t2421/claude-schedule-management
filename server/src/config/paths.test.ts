import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import {
  ROOT,
  JOBS_DIR,
  PLISTS_DIR,
  LOGS_DIR,
  RUNNER,
  LAUNCH_AGENTS_DIR,
  LABEL_PREFIX,
  SERVICE_LABEL,
  labelFor,
  generatedPlistPath,
  linkedPlistPath,
  jobYamlPath,
  jobLogsDir,
} from "./paths.js";

describe("config/paths — constants", () => {
  it("JOBS_DIR is ROOT/jobs", () => {
    assert.equal(JOBS_DIR, path.join(ROOT, "jobs"));
  });

  it("PLISTS_DIR is ROOT/plists", () => {
    assert.equal(PLISTS_DIR, path.join(ROOT, "plists"));
  });

  it("LOGS_DIR is ROOT/logs", () => {
    assert.equal(LOGS_DIR, path.join(ROOT, "logs"));
  });

  it("RUNNER is ROOT/bin/runner.sh", () => {
    assert.equal(RUNNER, path.join(ROOT, "bin", "runner.sh"));
  });

  it("LAUNCH_AGENTS_DIR is under the home directory", () => {
    assert.ok(
      LAUNCH_AGENTS_DIR.startsWith(os.homedir()),
      `expected path under ${os.homedir()}, got ${LAUNCH_AGENTS_DIR}`,
    );
  });

  it("LABEL_PREFIX defaults to local.claude-schedule.job", () => {
    if (!process.env.CLAUDE_SCHEDULE_LABEL_PREFIX) {
      assert.equal(LABEL_PREFIX, "local.claude-schedule.job");
    }
  });

  it("SERVICE_LABEL defaults to local.claude-schedule.service", () => {
    if (!process.env.CLAUDE_SCHEDULE_SERVICE_LABEL) {
      assert.equal(SERVICE_LABEL, "local.claude-schedule.service");
    }
  });
});

describe("config/paths — labelFor", () => {
  it("returns LABEL_PREFIX.jobName", () => {
    assert.equal(labelFor("my-job"), `${LABEL_PREFIX}.my-job`);
  });

  it("preserves the full job name unchanged", () => {
    assert.equal(labelFor("daily-backup"), `${LABEL_PREFIX}.daily-backup`);
    assert.equal(labelFor("a"), `${LABEL_PREFIX}.a`);
  });
});

describe("config/paths — generatedPlistPath", () => {
  it("returns a path inside PLISTS_DIR", () => {
    assert.ok(
      generatedPlistPath("my-job").startsWith(PLISTS_DIR + path.sep),
      `expected path under ${PLISTS_DIR}`,
    );
  });

  it("filename is <label>.plist", () => {
    assert.equal(
      path.basename(generatedPlistPath("my-job")),
      `${labelFor("my-job")}.plist`,
    );
  });
});

describe("config/paths — linkedPlistPath", () => {
  it("returns a path inside LAUNCH_AGENTS_DIR", () => {
    assert.ok(
      linkedPlistPath("my-job").startsWith(LAUNCH_AGENTS_DIR + path.sep),
      `expected path under ${LAUNCH_AGENTS_DIR}`,
    );
  });

  it("filename is <label>.plist", () => {
    assert.equal(
      path.basename(linkedPlistPath("my-job")),
      `${labelFor("my-job")}.plist`,
    );
  });
});

describe("config/paths — jobYamlPath", () => {
  it("returns a path inside JOBS_DIR", () => {
    assert.ok(
      jobYamlPath("my-job").startsWith(JOBS_DIR + path.sep),
      `expected path under ${JOBS_DIR}`,
    );
  });

  it("filename is <jobName>.yaml", () => {
    assert.equal(path.basename(jobYamlPath("my-job")), "my-job.yaml");
  });
});

describe("config/paths — jobLogsDir", () => {
  it("returns a path inside LOGS_DIR", () => {
    assert.ok(
      jobLogsDir("my-job").startsWith(LOGS_DIR + path.sep),
      `expected path under ${LOGS_DIR}`,
    );
  });

  it("final path segment is the job name", () => {
    assert.equal(path.basename(jobLogsDir("my-job")), "my-job");
  });
});
