import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JobName } from "./JobName.js";
import { ValidationError } from "../errors.js";

describe("JobName", () => {
  it("accepts lowercase letters, digits, and dashes", () => {
    assert.equal(JobName.parse("daily-review").value, "daily-review");
    assert.equal(JobName.parse("job1").value, "job1");
    assert.equal(JobName.parse("a").value, "a");
  });

  it("rejects uppercase, underscores, leading dash, and empty", () => {
    assert.throws(() => JobName.parse("Daily-Review"), ValidationError);
    assert.throws(() => JobName.parse("daily_review"), ValidationError);
    assert.throws(() => JobName.parse("-daily"), ValidationError);
    assert.throws(() => JobName.parse(""), ValidationError);
    assert.throws(() => JobName.parse(undefined), ValidationError);
  });

  it("equals compares by value", () => {
    assert.ok(JobName.parse("a").equals(JobName.parse("a")));
    assert.ok(!JobName.parse("a").equals(JobName.parse("b")));
  });
});
