import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Job } from "../../domain/job/Job.js";
import { jobToDto, jobWithStatusToDto } from "./dto.js";
import type { JobStatus } from "../../domain/scheduler/Scheduler.js";

const base = {
  name: "nightly-report",
  schedule: { cron: "0 2 * * *" },
  prompt: "run the report",
  enabled: true,
  working_directory: "/home/user/project",
};

function makeJob(overrides: Record<string, unknown> = {}): Job {
  return Job.fromPlain({ ...base, ...overrides });
}

describe("jobToDto", () => {
  it("returns the job's plain representation for a minimal job", () => {
    const job = makeJob();
    const dto = jobToDto(job);
    assert.deepEqual(dto, {
      name: "nightly-report",
      description: undefined,
      enabled: true,
      schedule: { cron: "0 2 * * *" },
      working_directory: "/home/user/project",
      prompt: "run the report",
      claude_args: ["-p"],
      env: undefined,
      timeout_seconds: undefined,
    });
  });

  it("includes optional fields when they are set", () => {
    const job = makeJob({
      description: "generates the weekly report",
      claude_args: ["--verbose"],
      env: { REPORT_MODE: "full" },
      timeout_seconds: 120,
    });
    const dto = jobToDto(job);
    assert.equal(dto.description, "generates the weekly report");
    assert.deepEqual(dto.claude_args, ["--verbose"]);
    assert.deepEqual(dto.env, { REPORT_MODE: "full" });
    assert.equal(dto.timeout_seconds, 120);
  });

  it("serializes a disabled job", () => {
    const job = makeJob({ enabled: false });
    assert.equal(jobToDto(job).enabled, false);
  });
});

describe("jobWithStatusToDto", () => {
  it("includes all job fields plus a status block", () => {
    const job = makeJob();
    const status: JobStatus = { loaded: true };
    const dto = jobWithStatusToDto(job, status);

    assert.equal(dto.name, "nightly-report");
    assert.equal(dto.prompt, "run the report");
    assert.deepEqual(dto.schedule, { cron: "0 2 * * *" });
  });

  it("nests name from job.name.value into the status block", () => {
    const job = makeJob();
    const status: JobStatus = { loaded: false };
    const dto = jobWithStatusToDto(job, status);
    assert.deepEqual(dto.status, { name: "nightly-report", loaded: false });
  });

  it("includes pid and lastExitStatus in the status block when present", () => {
    const job = makeJob();
    const status: JobStatus = { loaded: true, pid: 1234, lastExitStatus: 0 };
    const dto = jobWithStatusToDto(job, status);
    assert.deepEqual(dto.status, {
      name: "nightly-report",
      loaded: true,
      pid: 1234,
      lastExitStatus: 0,
    });
  });

  it("omits pid and lastExitStatus from status when absent", () => {
    const job = makeJob();
    const status: JobStatus = { loaded: false };
    const dto = jobWithStatusToDto(job, status);
    assert.equal("pid" in dto.status, false);
    assert.equal("lastExitStatus" in dto.status, false);
  });
});
