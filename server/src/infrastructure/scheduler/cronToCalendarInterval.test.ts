import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cronToCalendarIntervals } from "./cronToCalendarInterval.js";
import { ValidationError } from "../../domain/errors.js";

describe("cronToCalendarIntervals", () => {
  it("rejects non-5-field expressions", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals(""), ValidationError);
    assert.throws(() => cronToCalendarIntervals("0 9 * * * *"), ValidationError);
  });

  it("converts daily 9am", () => {
    assert.deepEqual(cronToCalendarIntervals("0 9 * * *"), [{ Minute: 0, Hour: 9 }]);
  });

  it("converts hourly on the hour", () => {
    assert.deepEqual(cronToCalendarIntervals("0 * * * *"), [{ Minute: 0 }]);
  });

  it("expands */15 for minute", () => {
    assert.deepEqual(cronToCalendarIntervals("*/15 * * * *"), [
      { Minute: 0 },
      { Minute: 15 },
      { Minute: 30 },
      { Minute: 45 },
    ]);
  });

  it("expands list for weekday", () => {
    assert.deepEqual(cronToCalendarIntervals("0 9 * * 1,3,5"), [
      { Minute: 0, Hour: 9, Weekday: 1 },
      { Minute: 0, Hour: 9, Weekday: 3 },
      { Minute: 0, Hour: 9, Weekday: 5 },
    ]);
  });

  it("expands range for weekday (mon-fri)", () => {
    assert.deepEqual(cronToCalendarIntervals("0 9 * * 1-5"), [
      { Minute: 0, Hour: 9, Weekday: 1 },
      { Minute: 0, Hour: 9, Weekday: 2 },
      { Minute: 0, Hour: 9, Weekday: 3 },
      { Minute: 0, Hour: 9, Weekday: 4 },
      { Minute: 0, Hour: 9, Weekday: 5 },
    ]);
  });

  it("cross-products multiple fields", () => {
    const r = cronToCalendarIntervals("0,30 9,17 * * *");
    assert.equal(r.length, 4);
    assert.deepEqual(r[0], { Minute: 0, Hour: 9 });
    assert.deepEqual(r[3], { Minute: 30, Hour: 17 });
  });

  it("rejects out-of-range values (above max)", () => {
    assert.throws(() => cronToCalendarIntervals("60 9 * * *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals("0 24 * * *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals("0 9 32 * *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals("0 9 * 13 *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals("0 9 * * 7"), ValidationError);
  });

  it("rejects out-of-range values (below min): dom and month start at 1, not 0", () => {
    // launchd's Day key is 1-based (1=first of month). 0 is not a valid day.
    assert.throws(() => cronToCalendarIntervals("0 9 0 * *"), ValidationError);
    // launchd's Month key is 1-based (1=January). 0 is not a valid month.
    assert.throws(() => cronToCalendarIntervals("0 9 * 0 *"), ValidationError);
  });

  it("rejects invalid range a>b", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 * * 5-1"), ValidationError);
  });

  it("rejects invalid step <= 0", () => {
    assert.throws(() => cronToCalendarIntervals("*/0 * * * *"), ValidationError);
  });

  it("handles first day of month", () => {
    assert.deepEqual(cronToCalendarIntervals("0 0 1 * *"), [
      { Minute: 0, Hour: 0, Day: 1 },
    ]);
  });

  it("returns 60 entries for every-minute wildcard", () => {
    const r = cronToCalendarIntervals("* * * * *");
    assert.equal(r.length, 60);
    assert.deepEqual(r[0], { Minute: 0 });
    assert.deepEqual(r[59], { Minute: 59 });
  });

  it("rejects empty entries in comma lists (trailing comma)", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 * * 1,"), ValidationError);
  });

  it("rejects empty entries in comma lists (leading comma)", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 * * ,1"), ValidationError);
  });

  it("rejects empty entries in comma lists (consecutive commas)", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 * * 1,,2"), ValidationError);
  });

  it("rejects non-decimal numeric forms (hex)", () => {
    assert.throws(() => cronToCalendarIntervals("0x3b * * * *"), ValidationError);
  });

  it("rejects values with leading sign", () => {
    assert.throws(() => cronToCalendarIntervals("+0 9 * * *"), ValidationError);
    assert.throws(() => cronToCalendarIntervals("-1 9 * * *"), ValidationError);
  });
});
