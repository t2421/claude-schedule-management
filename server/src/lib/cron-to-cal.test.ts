import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cronToCalendarIntervals } from "./cron-to-cal.js";

describe("cronToCalendarIntervals", () => {
  it("rejects non-5-field expressions", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 *"));
    assert.throws(() => cronToCalendarIntervals(""));
    assert.throws(() => cronToCalendarIntervals("0 9 * * * *"));
  });

  it("converts daily 9am", () => {
    const r = cronToCalendarIntervals("0 9 * * *");
    assert.deepEqual(r, [{ Minute: 0, Hour: 9 }]);
  });

  it("converts hourly on the hour", () => {
    const r = cronToCalendarIntervals("0 * * * *");
    assert.deepEqual(r, [{ Minute: 0 }]);
  });

  it("expands */15 for minute", () => {
    const r = cronToCalendarIntervals("*/15 * * * *");
    assert.deepEqual(r, [
      { Minute: 0 },
      { Minute: 15 },
      { Minute: 30 },
      { Minute: 45 },
    ]);
  });

  it("expands list for weekday", () => {
    const r = cronToCalendarIntervals("0 9 * * 1,3,5");
    assert.deepEqual(r, [
      { Minute: 0, Hour: 9, Weekday: 1 },
      { Minute: 0, Hour: 9, Weekday: 3 },
      { Minute: 0, Hour: 9, Weekday: 5 },
    ]);
  });

  it("expands range for weekday (mon-fri)", () => {
    const r = cronToCalendarIntervals("0 9 * * 1-5");
    assert.deepEqual(r, [
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

  it("rejects out-of-range values", () => {
    assert.throws(() => cronToCalendarIntervals("60 9 * * *"));
    assert.throws(() => cronToCalendarIntervals("0 24 * * *"));
    assert.throws(() => cronToCalendarIntervals("0 9 32 * *"));
    assert.throws(() => cronToCalendarIntervals("0 9 * 13 *"));
    assert.throws(() => cronToCalendarIntervals("0 9 * * 7"));
  });

  it("rejects invalid range a>b", () => {
    assert.throws(() => cronToCalendarIntervals("0 9 * * 5-1"));
  });

  it("rejects invalid step <= 0", () => {
    assert.throws(() => cronToCalendarIntervals("*/0 * * * *"));
  });

  it("handles first day of month", () => {
    const r = cronToCalendarIntervals("0 0 1 * *");
    assert.deepEqual(r, [{ Minute: 0, Hour: 0, Day: 1 }]);
  });

  it("returns 60 entries for every-minute (wildcard everything)", () => {
    const r = cronToCalendarIntervals("* * * * *");
    assert.equal(r.length, 60);
    assert.deepEqual(r[0], { Minute: 0 });
    assert.deepEqual(r[59], { Minute: 59 });
  });
});
