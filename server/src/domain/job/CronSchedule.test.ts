import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CronSchedule } from "./CronSchedule.js";
import { ValidationError } from "../errors.js";

describe("CronSchedule", () => {
  it("accepts a 5-field expression", () => {
    assert.equal(CronSchedule.parse("0 9 * * *").expression, "0 9 * * *");
  });

  it("trims surrounding whitespace", () => {
    assert.equal(CronSchedule.parse("  0 9 * * *  ").expression, "0 9 * * *");
  });

  it("rejects wrong field count", () => {
    assert.throws(() => CronSchedule.parse("0 9 *"), ValidationError);
    assert.throws(() => CronSchedule.parse("0 9 * * * *"), ValidationError);
  });

  it("rejects non-string / empty", () => {
    assert.throws(() => CronSchedule.parse(undefined), ValidationError);
    assert.throws(() => CronSchedule.parse(""), ValidationError);
    assert.throws(() => CronSchedule.parse("   "), ValidationError);
  });
});
