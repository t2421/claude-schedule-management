import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCronFromBuilder,
  parseBuilderFromCron,
  parseNumberList,
} from "./scheduleBuilder.js";

describe("parseNumberList", () => {
  it("parses a single number", () => {
    assert.deepEqual(parseNumberList("3", 0, 6), [3]);
  });

  it("parses a comma-separated list", () => {
    assert.deepEqual(parseNumberList("1,3,5", 0, 6), [1, 3, 5]);
  });

  it("parses a range", () => {
    assert.deepEqual(parseNumberList("1-5", 0, 6), [1, 2, 3, 4, 5]);
  });

  it("parses mixed range and singles", () => {
    assert.deepEqual(parseNumberList("0,1-3,6", 0, 6), [0, 1, 2, 3, 6]);
  });

  it("deduplicates", () => {
    assert.deepEqual(parseNumberList("1,1,2", 0, 6), [1, 2]);
  });

  it("returns null for empty string", () => {
    assert.equal(parseNumberList("", 0, 6), null);
  });

  it("returns null for out-of-range value", () => {
    assert.equal(parseNumberList("7", 0, 6), null);
  });

  it("returns null for invalid range (a > b)", () => {
    assert.equal(parseNumberList("5-3", 0, 6), null);
  });

  it("returns null for step expression", () => {
    assert.equal(parseNumberList("*/2", 0, 59), null);
  });

  it("returns null for non-numeric content", () => {
    assert.equal(parseNumberList("abc", 0, 6), null);
  });
});

describe("parseBuilderFromCron", () => {
  it("parses daily9 preset", () => {
    const b = parseBuilderFromCron("0 9 * * *");
    assert.ok(b);
    assert.equal(b.minute, 0);
    assert.equal(b.startHour, 9);
    assert.equal(b.endHour, 9);
    assert.deepEqual(b.weekdays, [0, 1, 2, 3, 4, 5, 6]);
  });

  it("parses weekday9 preset", () => {
    const b = parseBuilderFromCron("0 9 * * 1-5");
    assert.ok(b);
    assert.deepEqual(b.weekdays, [1, 2, 3, 4, 5]);
    assert.equal(b.startHour, 9);
    assert.equal(b.endHour, 9);
  });

  it("parses hour range", () => {
    const b = parseBuilderFromCron("0 9-18 * * 1-5");
    assert.ok(b);
    assert.equal(b.startHour, 9);
    assert.equal(b.endHour, 18);
  });

  it("parses single weekday", () => {
    const b = parseBuilderFromCron("0 9 * * 1");
    assert.ok(b);
    assert.deepEqual(b.weekdays, [1]);
  });

  it("returns null for step minute", () => {
    assert.equal(parseBuilderFromCron("*/5 * * * *"), null);
  });

  it("returns null for step hour", () => {
    assert.equal(parseBuilderFromCron("0 * * * *"), null);
  });

  it("returns null for dom constraint", () => {
    assert.equal(parseBuilderFromCron("0 0 1 * *"), null);
  });

  it("returns null for month constraint", () => {
    assert.equal(parseBuilderFromCron("0 0 * 6 *"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(parseBuilderFromCron(""), null);
  });

  it("returns null for wrong field count", () => {
    assert.equal(parseBuilderFromCron("0 9 * *"), null);
  });

  it("returns null for out-of-range minute", () => {
    assert.equal(parseBuilderFromCron("60 9 * * *"), null);
  });

  it("returns null for inverted hour range", () => {
    assert.equal(parseBuilderFromCron("0 18-9 * * *"), null);
  });

  it("parses comma-separated weekdays", () => {
    const b = parseBuilderFromCron("0 9 * * 1,3,5");
    assert.ok(b);
    assert.deepEqual(b.weekdays, [1, 3, 5]);
    assert.equal(b.startHour, 9);
  });

  it("parses mixed range-and-single weekdays", () => {
    const b = parseBuilderFromCron("0 9 * * 1,3-5");
    assert.ok(b);
    assert.deepEqual(b.weekdays, [1, 3, 4, 5]);
  });

  it("parses weekend-only schedule", () => {
    const b = parseBuilderFromCron("0 10 * * 0,6");
    assert.ok(b);
    assert.deepEqual(b.weekdays, [0, 6]);
    assert.equal(b.startHour, 10);
  });

  it("returns null for out-of-range hour (24)", () => {
    assert.equal(parseBuilderFromCron("0 24 * * *"), null);
  });
});

describe("buildCronFromBuilder", () => {
  it("builds all-days cron with * DOW", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 9,
      endHour: 9,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    assert.equal(cron, "0 9 * * *");
  });

  it("builds weekday cron with range DOW", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 9,
      endHour: 9,
      weekdays: [1, 2, 3, 4, 5],
    });
    assert.equal(cron, "0 9 * * 1-5");
  });

  it("builds hour-range cron", () => {
    const cron = buildCronFromBuilder({
      minute: 30,
      startHour: 9,
      endHour: 18,
      weekdays: [1, 2, 3, 4, 5],
    });
    assert.equal(cron, "30 9-18 * * 1-5");
  });

  it("clamps minute above 59 to 59", () => {
    const cron = buildCronFromBuilder({
      minute: 100,
      startHour: 9,
      endHour: 9,
      weekdays: [1],
    });
    assert.equal(cron, "59 9 * * 1");
  });

  it("clamps endHour below startHour up to startHour", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 12,
      endHour: 9,
      weekdays: [1],
    });
    assert.equal(cron, "0 12 * * 1");
  });

  it("deduplicates weekdays", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 9,
      endHour: 9,
      weekdays: [1, 1, 2],
    });
    assert.equal(cron, "0 9 * * 1-2");
  });

  it("builds non-contiguous weekdays as comma-separated", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 9,
      endHour: 9,
      weekdays: [1, 3, 5],
    });
    assert.equal(cron, "0 9 * * 1,3,5");
  });

  it("builds weekend-only cron with comma-separated sat/sun", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 10,
      endHour: 10,
      weekdays: [0, 6],
    });
    assert.equal(cron, "0 10 * * 0,6");
  });

  it("clamps startHour above 23 to 23", () => {
    const cron = buildCronFromBuilder({
      minute: 0,
      startHour: 25,
      endHour: 25,
      weekdays: [1],
    });
    assert.equal(cron, "0 23 * * 1");
  });

  it("clamps negative minute to 0", () => {
    const cron = buildCronFromBuilder({
      minute: -5,
      startHour: 9,
      endHour: 9,
      weekdays: [1],
    });
    assert.equal(cron, "0 9 * * 1");
  });
});

describe("round-trip: preset strings survive parse → build unchanged", () => {
  const presets = [
    "0 9 * * *",
    "0 12 * * *",
    "0 18 * * *",
    "0 0 * * *",
    "0 9 * * 1-5",
    "0 9 * * 1",
    "0 9 * * 1,3,5",
    "0 10 * * 0,6",
  ];

  for (const preset of presets) {
    it(`round-trips "${preset}"`, () => {
      const builder = parseBuilderFromCron(preset);
      assert.ok(builder, `failed to parse: ${preset}`);
      assert.equal(buildCronFromBuilder(builder), preset);
    });
  }
});
